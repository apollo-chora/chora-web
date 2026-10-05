import { unsavedChangesGuard, HasUnsavedChanges } from './unsaved-changes.guard';

describe('unsavedChangesGuard', () => {
  it('should allow navigation when no unsaved changes', () => {
    const component: HasUnsavedChanges = { hasUnsavedChanges: () => false };
    const result = unsavedChangesGuard(component, {} as never, {} as never, {} as never);
    expect(result).toBe(true);
  });

  it('should prompt when unsaved changes exist and user confirms', () => {
    const component: HasUnsavedChanges = { hasUnsavedChanges: () => true };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const result = unsavedChangesGuard(component, {} as never, {} as never, {} as never);
    expect(window.confirm).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('should block navigation when user cancels confirm', () => {
    const component: HasUnsavedChanges = { hasUnsavedChanges: () => true };
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const result = unsavedChangesGuard(component, {} as never, {} as never, {} as never);
    expect(result).toBe(false);
  });
});
