export function requestOliviaDesktopExitConfirmation(event: BeforeUnloadEvent): void {
  event.preventDefault();
  event.returnValue = "";
}
