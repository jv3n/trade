---
name: angular-component
description: Create modern Angular standalone components following v21+ best practices for the PortfolioAI frontend. Use for building UI components with signal-based inputs/outputs, host bindings, content projection, and lifecycle hooks. Triggers on component creation, refactoring class-based inputs to signals, adding host bindings, or implementing accessible interactive components.
---

# Angular Component

Standalone components for Angular v21+ (the version used in `frontend/`). Components are standalone by default — do NOT set `standalone: true`. **Change detection**: PortfolioAI runs `provideZonelessChangeDetection()`, so `ChangeDetectionStrategy.OnPush` is **not required** — signals drive change detection. Adding `OnPush` is a no-op functionally and adds noise. Leave the default strategy on new components.

## Component structure

```typescript
import { Component, input, output, computed, booleanAttribute } from '@angular/core';

@Component({
  selector: 'app-user-card',
  host: {
    'class': 'user-card',
    '[class.active]': 'isActive()',
    '(click)': 'handleClick()',
  },
  template: `
    <img [src]="avatarUrl()" [alt]="name() + ' avatar'" />
    <h2>{{ name() }}</h2>
    @if (showEmail()) {
      <p>{{ email() }}</p>
    }
  `,
  styles: `
    :host { display: block; }
    :host.active { border: 2px solid blue; }
  `,
})
export class UserCard {
  name = input.required<string>();
  email = input<string>('');
  showEmail = input(false);
  isActive = input(false, { transform: booleanAttribute });

  avatarUrl = computed(() => `https://api.example.com/avatar/${this.name()}`);
  selected = output<string>();

  handleClick() { this.selected.emit(this.name()); }
}
```

## Signal inputs

```typescript
name = input.required<string>();                                       // required
count = input(0);                                                       // optional with default
label = input<string>();                                                // optional, undefined allowed
size = input('medium', { alias: 'buttonSize' });                        // aliased
disabled = input(false, { transform: booleanAttribute });               // boolean transform
value = input(0, { transform: numberAttribute });                       // number transform
```

Pair with [`angular-signals > input() / output()`](../angular-signals/SKILL.md#input--output--signal-based-component-io).

## Signal outputs

```typescript
clicked = output<void>();
selected = output<Item>();
valueChange = output<number>({ alias: 'change' });

this.clicked.emit();
this.selected.emit(item);
```

For RxJS-source outputs: `outputFromObservable(subject$)`.

## Host bindings — `host` object only

Use the `host` object in `@Component`. Do NOT use `@HostBinding` or `@HostListener` decorators.

```typescript
host: {
  'role': 'button',
  '[class.primary]': 'variant() === "primary"',
  '[class.disabled]': 'disabled()',
  '[style.--btn-color]': 'color()',
  '[attr.aria-disabled]': 'disabled()',
  '[attr.tabindex]': 'disabled() ? -1 : 0',
  '(click)': 'onClick($event)',
  '(keydown.enter)': 'onClick($event)',
  '(keydown.space)': 'onClick($event)',
}
```

## Content projection

```typescript
template: `
  <header><ng-content select="[card-header]" /></header>
  <main><ng-content /></main>
  <footer><ng-content select="[card-footer]" /></footer>
`,
```

## Lifecycle hooks

```typescript
import { afterNextRender, afterRender } from '@angular/core';

constructor() {
  afterNextRender(() => { /* once after first render — SSR-safe */ });
  afterRender(() => { /* after every render */ });
}

ngOnInit() { /* … */ }
ngOnDestroy() { /* … */ }
```

## Template syntax — native control flow

Use native control flow. Do NOT use `*ngIf`, `*ngFor`, `*ngSwitch`.

```html
@if (isLoading()) {
  <app-spinner />
} @else if (error()) {
  <app-error [message]="error()" />
} @else {
  <app-content [data]="data()" />
}

@for (item of items(); track item.id) {
  <app-item [item]="item" />
} @empty {
  <p>No items found</p>
}

@switch (status()) {
  @case ('pending') { <span>Pending</span> }
  @case ('active') { <span>Active</span> }
  @default { <span>Unknown</span> }
}
```

## Class and style bindings

Do NOT use `ngClass` / `ngStyle`. Use direct bindings:

```html
<div [class.active]="isActive()">Single class</div>
<div [class]="classString()">Class string</div>
<div [style.color]="textColor()">Styled text</div>
<div [style.width.px]="width()">With unit</div>
```

## Images — `NgOptimizedImage`

```typescript
import { NgOptimizedImage } from '@angular/common';

@Component({
  imports: [NgOptimizedImage],
  template: `
    <img ngSrc="/assets/hero.jpg" width="800" height="600" priority />
    <img [ngSrc]="imageUrl()" width="200" height="200" />
  `,
})
```

## Accessibility

Components must pass AXE checks, meet WCAG AA, include ARIA for interactive elements, support keyboard navigation, maintain visible focus indicators.

```typescript
@Component({
  selector: 'app-toggle',
  host: {
    'role': 'switch',
    '[attr.aria-checked]': 'checked()',
    '[attr.aria-label]': 'label()',
    'tabindex': '0',
    '(click)': 'toggle()',
    '(keydown.enter)': 'toggle()',
    '(keydown.space)': 'toggle(); $event.preventDefault()',
  },
})
export class Toggle {
  label = input.required<string>();
  checked = input(false, { transform: booleanAttribute });
  checkedChange = output<boolean>();
  toggle() { this.checkedChange.emit(!this.checked()); }
}
```
