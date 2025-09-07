export const createOrder = ({
  userEmail,
  userBalance,
  margin,
  asset,
  type,
  leverage = 1,
  slippage,
  currentPrice,
  requestId,
}: {
  userEmail: string;
  userBalance: number;
  margin: number;
  asset: string;
  type: "long" | "short";
  leverage: number;
  slippage: number;
  currentPrice: number;
  requestId: string;
}) => {
  // For market orders without priceForSlippage, we need to implement a different approach
  // One option is to use a recent average price or implement a price validation mechanism
  // For now, we'll proceed with the order creation using current market price
  
  const orderId = Math.floor(Math.random() * 1000000);

  let quantity: number;
  if (type === "long" || type === "short") {
    quantity = (margin * leverage) / currentPrice;
    userBalance = userBalance - margin;
  } else {
    throw new Error("Invalid order type. Must be 'long' or 'short'.");
  }

  const unrealizedPnL = calculateUnrealizedPnL(
    type,
    quantity,
    currentPrice,
    currentPrice
  );

  const order = {
    orderId,
    userEmail,
    asset,
    type,
    margin,
    leverage,
    slippage,
    entryPrice: currentPrice,
    currentPrice,
    quantity,
    unrealizedPnL,
    userBalance,
    requestId,
  };

  console.log("Created Order:", order);
  console.log("Unrealized PnL:", unrealizedPnL);

  return order;
};

// Slippage check function for market orders
export const checkSlippage = (
  type: "long" | "short",
  expectedPrice: number,
  actualPrice: number,
  slippage: number
): boolean => {
  if (type === "long") {
    // For long positions, actual price should not be higher than expected + slippage
    return actualPrice <= expectedPrice * (1 + slippage);
  } else if (type === "short") {
    // For short positions, actual price should not be lower than expected - slippage
    return actualPrice >= expectedPrice * (1 - slippage);
  }
  return false;
};

export const calculateUnrealizedPnL = (
  type: "long" | "short",
  quantity: number,
  entryPrice: number,
  currentPrice: number
): number => {
  if (type === "long") {
    return (currentPrice - entryPrice) * quantity;
  } else if (type === "short") {
    return (entryPrice - currentPrice) * quantity;
  }
  return 0;
};
