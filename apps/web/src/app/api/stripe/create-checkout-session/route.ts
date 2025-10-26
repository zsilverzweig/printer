import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { log } from "@/lib/utils/logger";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil",
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      waitlistEntryId,
      positions,
      amount,
      successUrl,
      cancelUrl,
    } = body;

    // Validate required fields
    if (!userId || !waitlistEntryId || !positions || !amount) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Waitlist Position Upgrade`,
              description: `Move up ${positions} position${
                positions > 1 ? "s" : ""
              } in the waitlist`,
            },
            unit_amount: amount * 100, // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      metadata: {
        waitlistEntryId,
        positions: positions.toString(),
        userId,
      },
    });

    log.success(
      "Checkout session created",
      { sessionId: session.id, userId, positions },
      "StripeAPI"
    );

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    log.failure("Failed to create checkout session", error, "StripeAPI");
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
