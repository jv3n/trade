/**
 * Pins the URL/method contract between [HttpOllamaStatusRepository] and the backend's
 * `/api/config/llm/status` route. Decoupled from the controller-level test on the backend
 * side : here we only verify that the front emits the right HTTP call and surfaces the wire
 * payload as-is.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { HttpOllamaStatusRepository } from './ollama-status.http';

describe('HttpOllamaStatusRepository', () => {
  let repo: HttpOllamaStatusRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpOllamaStatusRepository],
    });
    repo = TestBed.inject(HttpOllamaStatusRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GETs /api/config/llm/status and returns the wire payload as-is', () => {
    let received: unknown;
    repo.get().subscribe((value) => (received = value));

    const req = http.expectOne('/api/config/llm/status');
    expect(req.request.method).toBe('GET');

    const wire = {
      daemonReachable: true,
      baseUrl: 'http://localhost:11434',
      latencyMs: 12,
      loadedModels: [
        {
          name: 'qwen2.5:3b',
          expiresAt: '2026-05-08T15:30:00Z',
          sizeVramBytes: 2_008_000_000,
        },
      ],
      availableModels: ['llama3.2:3b', 'qwen2.5:3b'],
      errorMessage: null,
    };
    req.flush(wire);

    expect(received).toEqual(wire);
  });

  it('unload POSTs the model name in a wrapped body and surfaces the post-action snapshot', () => {
    // The wrapper `{ model }` keeps the door open for future fields (e.g. `{ model, force: true }`)
    // without breaking the wire contract.
    let received: unknown;
    repo.unload('qwen2.5:3b').subscribe((value) => (received = value));

    const req = http.expectOne('/api/config/llm/unload-model');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ model: 'qwen2.5:3b' });

    const wire = {
      daemonReachable: true,
      baseUrl: 'http://localhost:11434',
      latencyMs: 9,
      loadedModels: [], // VRAM emptied after the unload took effect
      availableModels: ['qwen2.5:3b'],
      errorMessage: null,
    };
    req.flush(wire);

    expect(received).toEqual(wire);
  });
});
