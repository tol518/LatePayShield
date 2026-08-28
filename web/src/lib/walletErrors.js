export function walletErrorMessage(error) {
  if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') {
    return 'The wallet request was cancelled. Nothing was registered.';
  }

  return error?.shortMessage
    ?? error?.info?.error?.message
    ?? error?.reason
    ?? error?.message
    ?? 'The wallet request failed. Nothing was registered.';
}
