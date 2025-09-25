import { NextRequest, NextResponse } from "next/server";

import { alpacaService } from "@/features/finance/lib/alpaca-service";
import {
  AlpacaOrder,
  AlpacaOrderRequest,
  AlpacaOrderSide,
  AlpacaPositionSide,
  AlpacaTimeInForce,
} from "@/features/finance/lib/types/alpaca";

type AlpacaOrderType =
  | "market"
  | "limit"
  | "stop"
  | "stop_limit"
  | "trailing_stop"
  | "take_profit";

const ORDER_TYPES: AlpacaOrderType[] = [
  "market",
  "limit",
  "stop",
  "stop_limit",
  "trailing_stop",
  "take_profit",
];

const TIME_IN_FORCE_OPTIONS: AlpacaTimeInForce[] = [
  "day",
  "gtc",
  "opg",
  "cls",
  "ioc",
  "fok",
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const environment = searchParams.get("environment") as "paper" | "live";
    const status = searchParams.get("status") || "all";
    const limit = searchParams.get("limit");

    if (!userId || !environment) {
      return NextResponse.json(
        { error: "userId and environment parameters are required" },
        { status: 400 }
      );
    }

    const parsedLimit = limit ? Number.parseInt(limit, 10) : 25;
    const validStatus =
      status === "open" || status === "closed" || status === "all"
        ? status
        : "all";

    const orders = await alpacaService.getOrders(
      userId,
      environment,
      validStatus,
      parsedLimit
    );
    return NextResponse.json({ orders });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch Alpaca orders";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = body.userId;
    const environment = body.environment as "paper" | "live";
    const symbolInput =
      typeof body.symbol === "string" ? body.symbol.trim() : "";

    if (!userId || !environment) {
      return NextResponse.json(
        { error: "userId and environment are required" },
        { status: 400 }
      );
    }

    if (!symbolInput) {
      return NextResponse.json(
        { error: "A stock symbol is required" },
        { status: 400 }
      );
    }

    const sideInput =
      typeof body.side === "string" ? body.side.toLowerCase() : "";
    if (sideInput !== "buy" && sideInput !== "sell") {
      return NextResponse.json(
        { error: "Order side must be either 'buy' or 'sell'" },
        { status: 400 }
      );
    }
    const side = sideInput as AlpacaOrderSide;

    const typeInput =
      typeof body.type === "string" ? body.type.toLowerCase() : "market";
    if (!ORDER_TYPES.includes(typeInput as AlpacaOrderType)) {
      return NextResponse.json(
        { error: "Unsupported order type" },
        { status: 400 }
      );
    }
    const orderType = typeInput as AlpacaOrderType;

    const timeInForceInput =
      typeof body.time_in_force === "string"
        ? body.time_in_force.toLowerCase()
        : "day";
    if (
      !TIME_IN_FORCE_OPTIONS.includes(timeInForceInput as AlpacaTimeInForce)
    ) {
      return NextResponse.json(
        { error: "Unsupported time in force option" },
        { status: 400 }
      );
    }
    const timeInForce = timeInForceInput as AlpacaTimeInForce;

    let qty: number | undefined;
    if (body.qty !== undefined) {
      const parsedQty =
        typeof body.qty === "number"
          ? body.qty
          : Number.parseFloat(String(body.qty));
      if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
        return NextResponse.json(
          { error: "Quantity must be a positive number" },
          { status: 400 }
        );
      }
      qty = parsedQty;
    }

    let notional: number | undefined;
    if (body.notional !== undefined) {
      const parsedNotional =
        typeof body.notional === "number"
          ? body.notional
          : Number.parseFloat(String(body.notional));
      if (!Number.isFinite(parsedNotional) || parsedNotional <= 0) {
        return NextResponse.json(
          { error: "Notional value must be positive" },
          { status: 400 }
        );
      }
      notional = parsedNotional;
    }

    if (qty === undefined && notional === undefined) {
      return NextResponse.json(
        { error: "Either quantity or notional value must be provided" },
        { status: 400 }
      );
    }

    let limitPrice: number | undefined;
    if (body.limit_price !== undefined) {
      const parsedLimit = Number.parseFloat(String(body.limit_price));
      if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
        return NextResponse.json(
          { error: "Limit price must be positive" },
          { status: 400 }
        );
      }
      limitPrice = parsedLimit;
    }

    let stopPrice: number | undefined;
    if (body.stop_price !== undefined) {
      const parsedStop = Number.parseFloat(String(body.stop_price));
      if (!Number.isFinite(parsedStop) || parsedStop <= 0) {
        return NextResponse.json(
          { error: "Stop price must be positive" },
          { status: 400 }
        );
      }
      stopPrice = parsedStop;
    }

    let positionSide: AlpacaPositionSide | undefined;
    if (body.position_side !== undefined) {
      const positionSideInput = String(body.position_side).toLowerCase();
      if (positionSideInput !== "long" && positionSideInput !== "short") {
        return NextResponse.json(
          { error: "Position side must be either 'long' or 'short'" },
          { status: 400 }
        );
      }
      positionSide = positionSideInput as AlpacaPositionSide;
    }

    const orderRequest: AlpacaOrderRequest = {
      symbol: symbolInput,
      side,
      type: orderType,
      time_in_force: timeInForce,
      qty,
      notional,
      limit_price: limitPrice,
      stop_price: stopPrice,
      extended_hours: Boolean(body.extended_hours),
      position_side: positionSide,
    };

    const order: AlpacaOrder = await alpacaService.placeOrder(
      userId,
      orderRequest,
      environment
    );
    return NextResponse.json({ order });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to submit Alpaca order";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
