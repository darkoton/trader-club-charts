import { betterSocket } from '../api/betterSocket';

export function resolveDisplayPayout(options: {
  currency?: string | null;
  apiName?: string | null;
  fallbackProfit?: number | null;
}): number | undefined {
  const { currency, apiName, fallbackProfit } = options;
  const resolvedSymbol = betterSocket.resolvePoAssetSymbol([apiName, currency]);

  if (resolvedSymbol) {
    const asset = betterSocket.getPoAsset(resolvedSymbol);
    if (asset && Number.isFinite(asset.payout)) {
      return asset.payout;
    }
  }

  if (Number.isFinite(fallbackProfit)) {
    return Number(fallbackProfit);
  }

  return undefined;
}