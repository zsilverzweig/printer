// Stripe mocking utilities

// Mock Stripe types
export interface MockStripeSession {
  id: string;
  url: string;
  payment_intent: string;
  amount_total: number;
  metadata: Record<string, string>;
}

export interface MockStripePaymentIntent {
  id: string;
  status: string;
  amount: number;
  currency: string;
  last_payment_error?: any;
}

export interface MockStripeEvent {
  id: string;
  type: string;
  data: {
    object: MockStripeSession | MockStripePaymentIntent;
  };
}

// Mock Stripe instance
export interface MockStripe {
  redirectToCheckout: jest.Mock;
  elements: jest.Mock;
  confirmPayment: jest.Mock;
}

// Factory functions for Stripe mocks
export const createMockStripeSession = (
  overrides: Partial<MockStripeSession> = {}
): MockStripeSession => ({
  id: "cs_test_1234567890",
  url: "https://checkout.stripe.com/pay/cs_test_1234567890",
  payment_intent: "pi_test_1234567890",
  amount_total: 3000, // $30.00 in cents
  metadata: {
    userId: "test-user-123",
    waitlistEntryId: "waitlist-entry-123",
    positions: "3",
    amount: "30",
  },
  ...overrides,
});

export const createMockStripePaymentIntent = (
  overrides: Partial<MockStripePaymentIntent> = {}
): MockStripePaymentIntent => ({
  id: "pi_test_1234567890",
  status: "succeeded",
  amount: 3000,
  currency: "usd",
  ...overrides,
});

export const createMockStripeEvent = (
  type: string,
  object: MockStripeSession | MockStripePaymentIntent,
  overrides: Partial<MockStripeEvent> = {}
): MockStripeEvent => ({
  id: "evt_test_1234567890",
  type,
  data: { object },
  ...overrides,
});

export const createMockStripe = (): MockStripe => ({
  redirectToCheckout: jest.fn().mockResolvedValue({ error: null }),
  elements: jest.fn(),
  confirmPayment: jest.fn(),
});

// Mock fetch responses for Stripe API calls
export const createMockFetchResponse = (data: any, ok = true) => ({
  ok,
  status: ok ? 200 : 400,
  json: jest.fn().mockResolvedValue(data),
  text: jest.fn().mockResolvedValue(JSON.stringify(data)),
});

// Predefined Stripe test scenarios
export const stripeTestScenarios = {
  // Successful checkout session creation
  successfulCheckout: () =>
    createMockFetchResponse({
      sessionId: "cs_test_1234567890",
      url: "https://checkout.stripe.com/pay/cs_test_1234567890",
    }),

  // Failed checkout session creation
  failedCheckout: () =>
    createMockFetchResponse(
      {
        error: "Invalid parameters",
      },
      false
    ),

  // Network error
  networkError: () => {
    const error = new Error("Network error");
    return Promise.reject(error);
  },

  // Successful payment intent
  successfulPayment: () =>
    createMockStripeEvent(
      "payment_intent.succeeded",
      createMockStripePaymentIntent({
        status: "succeeded",
      })
    ),

  // Failed payment intent
  failedPayment: () =>
    createMockStripeEvent(
      "payment_intent.payment_failed",
      createMockStripePaymentIntent({
        status: "requires_payment_method",
        last_payment_error: {
          message: "Your card was declined.",
        },
      })
    ),

  // Completed checkout session
  completedCheckout: () =>
    createMockStripeEvent(
      "checkout.session.completed",
      createMockStripeSession({
        amount_total: 3000,
        metadata: {
          userId: "test-user-123",
          waitlistEntryId: "waitlist-entry-123",
          positions: "3",
          amount: "30",
        },
      })
    ),
};

// Setup Stripe mocks for tests
export const setupStripeMocks = () => {
  const mockFetch = jest.fn();
  const mockLoadStripe = jest.fn();
  const mockStripe = createMockStripe();

  // Mock global fetch
  global.fetch = mockFetch;

  // Mock Stripe loading
  mockLoadStripe.mockResolvedValue(mockStripe);

  jest.mock("@stripe/stripe-js", () => ({
    loadStripe: mockLoadStripe,
  }));

  jest.mock("@/lib/utils/logger", () => ({
    log: {
      success: jest.fn(),
      failure: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    },
  }));

  return {
    mockFetch,
    mockLoadStripe,
    mockStripe,
  };
};

// Helper to simulate Stripe checkout flow
export const simulateCheckoutFlow = async (
  mocks: ReturnType<typeof setupStripeMocks>,
  scenario: keyof typeof stripeTestScenarios = "successfulCheckout"
) => {
  const response = stripeTestScenarios[scenario]();

  if (response instanceof Promise) {
    // Network error case
    mocks.mockFetch.mockRejectedValue(response);
  } else {
    mocks.mockFetch.mockResolvedValue(response);
  }

  return response;
};

// Helper to test webhook events
export const simulateWebhookEvent = (
  eventType: string,
  object: MockStripeSession | MockStripePaymentIntent
) => {
  return createMockStripeEvent(eventType, object);
};

// Mock Stripe service responses
export const mockStripeServiceResponses = {
  createCheckoutSession: jest.fn().mockResolvedValue({
    sessionId: "cs_test_1234567890",
    url: "https://checkout.stripe.com/pay/cs_test_1234567890",
  }),
  redirectToCheckout: jest.fn().mockResolvedValue(undefined),
  purchasePositions: jest.fn().mockResolvedValue(undefined),
};

// Helper to create checkout session parameters
export const createCheckoutParams = (overrides: any = {}) => ({
  userId: "test-user-123",
  waitlistEntryId: "waitlist-entry-123",
  positions: 3,
  amount: 30,
  successUrl: "https://example.com/success",
  cancelUrl: "https://example.com/cancel",
  ...overrides,
});

// Helper to verify Stripe API calls
export const verifyStripeApiCall = (
  mockFetch: jest.Mock,
  expectedUrl: string,
  expectedData: any
) => {
  expect(mockFetch).toHaveBeenCalledWith(
    expectedUrl,
    expect.objectContaining({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(expectedData),
    })
  );
};
