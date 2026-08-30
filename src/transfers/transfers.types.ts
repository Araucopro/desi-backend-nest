export type TransferCompletionItem = {
  variationID: string;
  quantity: number;
};

export type TransferCompletionPlan = {
  transferID: string;
  originStoreID: string;
  destinationStoreID: string;
  tenantID?: string;
  items: TransferCompletionItem[];
};
