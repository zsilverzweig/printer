import { waitlistService } from "@/features/waitlist/services/waitlist-service";
import { log } from "@/lib/utils/logger";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia",
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature")!;

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      log.error("Webhook signature verification failed", err, "StripeWebhook");
      return NextResponse.json(
        { error: "Webhook signature verification failed" },
        { status: 400 }
      );
    }

    // Handle the event
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(
          event.data.object as Stripe.PaymentIntent
        );
        break;
      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(
          event.data.object as Stripe.PaymentIntent
        );
        break;
      default:
        log.info(
          `Unhandled event type: ${event.type}`,
          undefined,
          "StripeWebhook"
        );
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    log.failure("Webhook handler failed", error, "StripeWebhook");
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
) {
  try {
    const { waitlistEntryId, positions, userId } = session.metadata || {};

    if (!waitlistEntryId || !positions || !userId) {
      log.error(
        "Missing metadata in checkout session",
        { sessionId: session.id },
        "StripeWebhook"
      );
      return;
    }

    const positionsNum = parseInt(positions);
    const amount = session.amount_total ? session.amount_total / 100 : 0; // Convert from cents

    // Record the payment in the waitlist service
    await waitlistService.recordPayment(
      userId,
      waitlistEntryId,
      positionsNum,
      amount,
      session.id,
      session.payment_intent as string
    );

    log.success(
      "Payment processed successfully",
      { sessionId: session.id, userId, positions: positionsNum, amount },
      "StripeWebhook"
    );
  } catch (error) {
    log.failure(
      "Failed to handle checkout session completion",
      error,
      "StripeWebhook"
    );
  }
}

async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent
) {
  log.info(
    "Payment intent succeeded",
    { paymentIntentId: paymentIntent.id },
    "StripeWebhook"
  );
}

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  log.error(
    "Payment intent failed",
    {
      paymentIntentId: paymentIntent.id,
      failureReason: paymentIntent.last_payment_error,
    },
    "StripeWebhook"
  );
}
