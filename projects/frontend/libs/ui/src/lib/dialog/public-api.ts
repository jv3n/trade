export * from './confirm-dialog';
export * from './dialog.module';
export * from './stb-confirm';

// The dialog service and its injection tokens, so the app never imports `@angular/material/dialog`.
export { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
// For specs : `{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }`.
export { MATERIAL_ANIMATIONS } from '@angular/material/core';
