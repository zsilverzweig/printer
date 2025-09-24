import { fireEvent, render, screen } from "@testing-library/react";
import { PortfolioWizardStreamDialog } from "../portfolio-wizard-stream-dialog";

// Mock the useWizardStream hook
jest.mock("../../hooks/use-wizard-stream", () => ({
  useWizardStream: () => ({
    isStreaming: false,
    currentStep: null,
    completedSteps: [],
    error: null,
    portfolio: null,
    startStream: jest.fn(),
    stopStream: jest.fn(),
    events: [],
  }),
}));

// Mock the useWizardDebugLogs hook
jest.mock("../../hooks/use-wizard-debug-logs", () => ({
  useWizardDebugLogs: () => ({
    logs: [],
    isVisible: false,
    addLog: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
  }),
}));

describe("PortfolioWizardStreamDialog", () => {
  const mockOnOpenChange = jest.fn();
  const mockOnComplete = jest.fn();

  const defaultProps = {
    open: true,
    onOpenChange: mockOnOpenChange,
    onComplete: mockOnComplete,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render dialog when open", () => {
    render(<PortfolioWizardStreamDialog {...defaultProps} />);

    expect(screen.getByText("AI Portfolio Wizard")).toBeInTheDocument();
    expect(
      screen.getByText("Generate a portfolio using AI")
    ).toBeInTheDocument();
  });

  it("should not render dialog when closed", () => {
    render(<PortfolioWizardStreamDialog {...defaultProps} open={false} />);

    expect(screen.queryByText("AI Portfolio Wizard")).not.toBeInTheDocument();
  });

  it("should have form inputs for portfolio name and thesis", () => {
    render(<PortfolioWizardStreamDialog {...defaultProps} />);

    expect(screen.getByLabelText(/portfolio name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/investment thesis/i)).toBeInTheDocument();
  });

  it("should have start wizard button", () => {
    render(<PortfolioWizardStreamDialog {...defaultProps} />);

    expect(
      screen.getByRole("button", { name: /start wizard/i })
    ).toBeInTheDocument();
  });

  it("should call onOpenChange when close button is clicked", () => {
    render(<PortfolioWizardStreamDialog {...defaultProps} />);

    const closeButton = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeButton);

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("should validate required fields before starting wizard", () => {
    render(<PortfolioWizardStreamDialog {...defaultProps} />);

    const startButton = screen.getByRole("button", { name: /start wizard/i });
    fireEvent.click(startButton);

    // Should show validation error for missing thesis
    expect(screen.getByText(/thesis is required/i)).toBeInTheDocument();
  });

  it("should allow user to input portfolio name and thesis", () => {
    render(<PortfolioWizardStreamDialog {...defaultProps} />);

    const nameInput = screen.getByLabelText(/portfolio name/i);
    const thesisInput = screen.getByLabelText(/investment thesis/i);

    fireEvent.change(nameInput, { target: { value: "Test Portfolio" } });
    fireEvent.change(thesisInput, { target: { value: "Test thesis" } });

    expect(nameInput).toHaveValue("Test Portfolio");
    expect(thesisInput).toHaveValue("Test thesis");
  });

  it("should reset form when dialog is closed", () => {
    const { rerender } = render(
      <PortfolioWizardStreamDialog {...defaultProps} />
    );

    const nameInput = screen.getByLabelText(/portfolio name/i);
    const thesisInput = screen.getByLabelText(/investment thesis/i);

    fireEvent.change(nameInput, { target: { value: "Test Portfolio" } });
    fireEvent.change(thesisInput, { target: { value: "Test thesis" } });

    // Close dialog
    rerender(<PortfolioWizardStreamDialog {...defaultProps} open={false} />);

    // Reopen dialog
    rerender(<PortfolioWizardStreamDialog {...defaultProps} open={true} />);

    // Form should be reset
    expect(screen.getByLabelText(/portfolio name/i)).toHaveValue("");
    expect(screen.getByLabelText(/investment thesis/i)).toHaveValue("");
  });
});
