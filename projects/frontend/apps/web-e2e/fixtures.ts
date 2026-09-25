import { APIRequestContext, BrowserContext, Locator, test as base, expect } from '@playwright/test';

/**
 * The backend API, as the signed-in user : shares the browser context's cookies, and echoes the
 * `XSRF-TOKEN` cookie in the header every mutating call needs.
 */
export class Api {
  constructor(
    private readonly context: BrowserContext,
    private readonly request: APIRequestContext,
  ) {}

  async get<T>(path: string): Promise<T> {
    const response = await this.request.get(path);
    expect(response.ok(), `GET ${path} → ${response.status()}`).toBe(true);
    return (await response.json()) as T;
  }

  async post<T>(path: string, data: unknown = {}): Promise<T> {
    const response = await this.request.post(path, { data, headers: await this.csrf() });
    expect(response.ok(), `POST ${path} → ${response.status()}`).toBe(true);
    return (await response.json()) as T;
  }

  async put<T>(path: string, data: unknown): Promise<T> {
    const response = await this.request.put(path, { data, headers: await this.csrf() });
    expect(response.ok(), `PUT ${path} → ${response.status()}`).toBe(true);
    return (await response.json()) as T;
  }

  async delete(path: string): Promise<void> {
    const response = await this.request.delete(path, { headers: await this.csrf() });
    expect(response.ok(), `DELETE ${path} → ${response.status()}`).toBe(true);
  }

  private async csrf(): Promise<Record<string, string>> {
    const token = (await this.context.cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value;
    return token ? { 'X-XSRF-TOKEN': token } : {};
  }
}

/**
 * Every test runs as a **brand-new user** opened through the backend's `e2e` profile, and removes
 * that user — with all their data — when it ends. Nothing is shared between tests.
 */
export const test = base.extend<{ api: Api }>({
  api: async ({ context }, use) => {
    const login = await context.request.post('/api/e2e/login');
    expect(login.ok(), `e2e login → ${login.status()} — is the backend on the e2e profile?`).toBe(
      true,
    );
    const api = new Api(context, context.request);
    await use(api);
    await api.delete('/api/e2e/me');
  },
});

export { expect };

/** Today as `YYYY-MM-DD`, on the New York calendar the app's trading day follows. */
export function isoToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

/**
 * Today at [hours]:[minutes] **in New York**, as an instant — for `page.clock` : the trading day's
 * boundaries (premarket, the 4 pm close) are wall-clock over there, whatever the runner's zone.
 */
export function newYorkTime(hours: number, minutes: number): Date {
  const [year, month, day] = isoToday().split('-').map(Number);
  const asUtc = Date.UTC(year, month - 1, day, hours, minutes);
  const wall = (zone: string) =>
    new Date(new Date(asUtc).toLocaleString('en-US', { timeZone: zone })).getTime();
  return new Date(asUtc + wall('UTC') - wall('America/New_York'));
}

/**
 * Reads an amount as the app renders it in French — `10 012,40 $ US`, with narrow and no-break
 * spaces — back into a number.
 */
export function parseFrAmount(text: string): number {
  return Number(
    text
      .replace(/[^\d,\-−]/g, '')
      .replace('−', '-')
      .replace(',', '.'),
  );
}

/**
 * Typed key by key at machine speed, then left : the number mask reacts to real input events, and
 * the pages save on blur. Focused rather than clicked — on an empty field, Material's floating label
 * sits over the input and takes the click.
 */
export async function typeNumber(field: Locator, value: string): Promise<void> {
  await field.focus();
  await field.pressSequentially(value);
  await field.blur();
}
