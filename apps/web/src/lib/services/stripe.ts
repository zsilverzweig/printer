// Stripe service for handling payments
import { loadStripe, Stripe } from "@stripe/stripe-js";

import { log } from "@/lib/utils/logger";

// Initialize Stripe
let stripePromise: Promise<Stripe | null>;

export const initializeStripe = () => {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  }
  return stripePromise;
};

export interface CreateCheckoutSessionParams {
  userId: string;
  waitlistEntryId: string;
  positions: number;
  amount: number;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResponse {
  sessionId: string;
  url: string;
}

export class StripeService {
  private static instance: StripeService;

  static getInstance(): StripeService {
    if (!StripeService.instance) {
      StripeService.instance = new StripeService();
    }
    return StripeService.instance;
  }

  /**
   * Create a checkout session for waitlist position upgrades
   */
  async createCheckoutSession(
    params: CreateCheckoutSessionParams
  ): Promise<CheckoutSessionResponse> {
    try {
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      log.failure("Failed to create checkout session", error, "StripeService");
      throw error;
    }
  }

  /**
   * Redirect to Stripe checkout
   */
  async redirectToCheckout(sessionId: string): Promise<void> {
    try {
      const stripe = await initializeStripe();
      if (!stripe) {
        throw new Error("Stripe failed to initialize");
      }

      const { error } = await stripe.redirectToCheckout({ sessionId });
      if (error) {
        throw error;
      }
    } catch (error) {
      log.failure("Failed to redirect to checkout", error, "StripeService");
      throw error;
    }
  }

  /**
   * Create checkout session and redirect
   */
  async purchasePositions(params: CreateCheckoutSessionParams): Promise<void> {
    try {
      const { sessionId } = await this.createCheckoutSession(params);
      await this.redirectToCheckout(sessionId);
    } catch (error) {
      log.failure("Failed to purchase positions", error, "StripeService");
      throw error;
    }
  }
}

// Export singleton instance
export const stripeService = StripeService.getInstance();

// Helper functions
export const createCheckoutSession = (params: CreateCheckoutSessionParams) =>
  stripeService.createCheckoutSession(params);
export const redirectToCheckout = (sessionId: string) =>
  stripeService.redirectToCheckout(sessionId);
export const purchasePositions = (params: CreateCheckoutSessionParams) =>
  stripeService.purchasePositions(params);

export default stripeService;
