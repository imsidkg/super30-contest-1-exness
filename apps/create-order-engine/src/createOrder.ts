
export const createOrder = ({ userEmail , userBalance, margin, asset, type, leverage = 1, slippage, priceForSlippag, currentPrice }: { userEmail:string ,userBalance: number, margin: number, asset: string, type: 'buy' | 'sell', leverage: number, slippage: number, priceForSlippag: number, currentPrice: number }) => {
 //todo : update teh balance after crateing the order
    let isSlippageAcceptable = false;
    if (type === "buy") {
        if (currentPrice <= priceForSlippag * (1 + slippage)) {
            isSlippageAcceptable = true;
        }
    } else if (type === "sell") {
        if (currentPrice >= priceForSlippag * (1 - slippage)) {
            isSlippageAcceptable = true;
        }
    }

    if (!isSlippageAcceptable) {
        console.warn(`Order not created due to unacceptable slippage. Asset: ${asset}, Type: ${type}, Intended Price: ${priceForSlippag}, Current Price: ${currentPrice}, Slippage: ${slippage}`);
        return null; 
    }

    const orderId = Math.floor(Math.random() * 1000000);  

    let quantity: number;
    if (type === "buy" || type === "sell") { 
        quantity = (margin * leverage) / priceForSlippag;
    } else {
        throw new Error("Invalid order type. Must be 'buy' or 'sell'.");
    }

    const unrealizedPnL = calculateUnrealizedPnL(type, quantity, priceForSlippag, currentPrice);

    const order = {
        orderId,
        userEmail,
        asset,
        type,
        margin,
        leverage,
        slippage,
        priceForSlippag, 
        currentPrice,    
        quantity,
        unrealizedPnL,
    };

    console.log("Created Order:", order);
    console.log("Unrealized PnL:", unrealizedPnL);

    return order;
};

export const calculateUnrealizedPnL = (type: 'buy' | 'sell', quantity: number, entryPrice: number, currentPrice: number): number => {
    if (type === "buy") {
        return (currentPrice - entryPrice) * quantity;
    } else if (type === "sell") {
        return (entryPrice - currentPrice) * quantity;
    }
    return 0;
}


