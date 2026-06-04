// Public API of @portfolioai/ui.
//
// The lib ships its design system through `libs/ui/styles/` (loaded by the consumer's
// `styles.scss`) and through component-wrapper NgModules under `libs/ui/src/lib/`. Each
// wrapper re-exports a Material module plus any directives / behaviour additions ; consumers
// import the wrapper (e.g. `StbDatePickerModule`) so the lib stays the single point of
// configuration for that surface.

export * from './lib/datepicker';
