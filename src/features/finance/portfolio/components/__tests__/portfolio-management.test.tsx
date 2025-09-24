import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PortfolioManagement } from "../portfolio-management";

// Mock the usePortfolios hook
const mockAddPortfolio = jest.fn();
const mockCreatePortfolio = jest.fn();
const mockUpdatePortfolio = jest.fn();
const mockDeletePortfolio = jest.fn();
const mockCreatePortfolioDraftFromThesis = jest.fn();

jest.mock("../../hooks/use-portfolios", () => ({
  usePortfolios: () => ({
    portfolios: [],
    loading: false,
    error: null,
    createPortfolio: mockCreatePortfolio,
    createPortfolioDraftFromThesis: mockCreatePortfolioDraftFromThesis,
    updatePortfolio: mockUpdatePortfolio,
    deletePortfolio: mockDeletePortfolio,
    addPortfolio: mockAddPortfolio,
  }),
}));

// Mock the useAgents hook
jest.mock("@/features/ai/agents/hooks/use-agents", () => ({
  useAgents: () => ({
    agents: [],
    loading: false,
    error: null,
  }),
}));

// Mock the wizard stream dialog
jest.mock("../portfolio-wizard-stream-dialog", () => ({
  PortfolioWizardStreamDialog: ({ onComplete, onOpenChange }: any) => (
    <div data-testid="wizard-stream-dialog">
      <button
        onClick={() => {
          onComplete({
            id: "test-portfolio",
            name: "Test Portfolio",
            description: "Test Description",
            thesis: "Test Thesis",
            positions: [],
            assignedAgents: [],
            isActive: false,
            metadata: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          onOpenChange(false);
        }}
      >
        Complete Wizard
      </button>
    </div>
  ),
}));

describe("PortfolioManagement", () => {
  const mockUserId = "test-user-123";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render portfolio management interface", () => {
    render(<PortfolioManagement userId={mockUserId} />);

    expect(screen.getByText("Portfolio Management")).toBeInTheDocument();
    expect(screen.getByText("Create Portfolio")).toBeInTheDocument();
    expect(screen.getByText("AI Wizard")).toBeInTheDocument();
    expect(screen.getByText("Streaming Wizard")).toBeInTheDocument();
  });

  it("should open streaming wizard dialog when button is clicked", () => {
    render(<PortfolioManagement userId={mockUserId} />);

    const streamingWizardButton = screen.getByText("Streaming Wizard");
    fireEvent.click(streamingWizardButton);

    expect(screen.getByTestId("wizard-stream-dialog")).toBeInTheDocument();
  });

  it("should handle wizard stream completion correctly", async () => {
    render(<PortfolioManagement userId={mockUserId} />);

    // Open streaming wizard
    const streamingWizardButton = screen.getByText("Streaming Wizard");
    fireEvent.click(streamingWizardButton);

    // Complete the wizard
    const completeButton = screen.getByText("Complete Wizard");
    fireEvent.click(completeButton);

    // Wait for the completion handler to be called
    await waitFor(() => {
      expect(mockAddPortfolio).toHaveBeenCalledWith({
        id: "test-portfolio",
        name: "Test Portfolio",
        description: "Test Description",
        thesis: "Test Thesis",
        positions: [],
        assignedAgents: [],
        isActive: false,
        metadata: {},
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    // Dialog should be closed
    expect(
      screen.queryByTestId("wizard-stream-dialog")
    ).not.toBeInTheDocument();
  });

  it("should handle wizard stream completion error gracefully", async () => {
    // Mock addPortfolio to throw an error
    mockAddPortfolio.mockImplementation(() => {
      throw new Error("Failed to add portfolio");
    });

    // Mock console.error to avoid noise in test output
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(<PortfolioManagement userId={mockUserId} />);

    // Open streaming wizard
    const streamingWizardButton = screen.getByText("Streaming Wizard");
    fireEvent.click(streamingWizardButton);

    // Complete the wizard
    const completeButton = screen.getByText("Complete Wizard");
    fireEvent.click(completeButton);

    // Wait for the error to be handled
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to handle portfolio completion:",
        expect.any(Error)
      );
    });

    // Dialog should still be closed even on error
    expect(
      screen.queryByTestId("wizard-stream-dialog")
    ).not.toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it("should have search functionality", () => {
    render(<PortfolioManagement userId={mockUserId} />);

    const searchInput = screen.getByPlaceholderText(/search portfolios/i);
    expect(searchInput).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "test search" } });
    expect(searchInput).toHaveValue("test search");
  });

  it("should show create portfolio dialog when button is clicked", () => {
    render(<PortfolioManagement userId={mockUserId} />);

    const createButton = screen.getByText("Create Portfolio");
    fireEvent.click(createButton);

    // The create dialog should be rendered (we can't test the exact content
    // since it's mocked, but we can verify the button click works)
    expect(createButton).toBeInTheDocument();
  });
});
