import type { AppEnvironment } from './auth';

export type OperationsOverview = {
  environment: AppEnvironment;
  ready: boolean;
  counts: {
    suppliers: number;
    fruits: number;
    confirmedConfigurations: number;
    pendingConfigurations: number;
    receipts: number;
    pricedPresentations: number;
    clients: number;
    sales: number;
  };
  inventory: { sealedBoxes: number };
  receivablesUsd: string;
};
