"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ServerUser } from "@/lib/auth/server";
import { Button } from "@/lib/components/ui/button";
import { Label } from "@/lib/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";
import { Textarea } from "@/lib/components/ui/textarea";
import { log } from "@/lib/utils/logger";

interface SignUpInfoFormProps {
  user: ServerUser;
}

export function SignUpInfoForm({ user }: SignUpInfoFormProps) {
  const router = useRouter();
  const [profileData, setProfileData] = useState({
    userType: "",
    investmentExperience: "",
    investmentGoals: "",
    riskTolerance: "",
    portfolioSize: "",
    investmentInterests: "",
    timeHorizon: "",
    additionalInfo: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setProfileData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // TODO: Save profile data to user profile
      log.info("Profile data collected", profileData, "SignUpInfoForm");

      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Redirect based on user status after profile completion
      // This will be handled by the routing logic
      router.push("/");
    } catch (err) {
      log.error("Failed to save profile", err, "SignUpInfoForm");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    router.push("/");
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="userType">What type of investor are you?</Label>
          <Select
            value={profileData.userType}
            onValueChange={(value) => handleInputChange("userType", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select your type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="individual">Individual Investor</SelectItem>
              <SelectItem value="professional">
                Professional Investor
              </SelectItem>
              <SelectItem value="institution">
                Institutional Investor
              </SelectItem>
              <SelectItem value="advisor">Financial Advisor</SelectItem>
              <SelectItem value="student">Student/Learning</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="experience">Investment Experience</Label>
          <Select
            value={profileData.investmentExperience}
            onValueChange={(value) =>
              handleInputChange("investmentExperience", value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select experience level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="beginner">Beginner (0-2 years)</SelectItem>
              <SelectItem value="intermediate">
                Intermediate (2-5 years)
              </SelectItem>
              <SelectItem value="advanced">Advanced (5-10 years)</SelectItem>
              <SelectItem value="expert">Expert (10+ years)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="goals">Primary Investment Goals</Label>
          <Select
            value={profileData.investmentGoals}
            onValueChange={(value) =>
              handleInputChange("investmentGoals", value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select your goals" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="growth">Long-term Growth</SelectItem>
              <SelectItem value="income">Income Generation</SelectItem>
              <SelectItem value="preservation">Capital Preservation</SelectItem>
              <SelectItem value="speculation">Speculation/Trading</SelectItem>
              <SelectItem value="retirement">Retirement Planning</SelectItem>
              <SelectItem value="education">Education Funding</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="risk">Risk Tolerance</Label>
          <Select
            value={profileData.riskTolerance}
            onValueChange={(value) => handleInputChange("riskTolerance", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select risk level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="conservative">Conservative</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="aggressive">Aggressive</SelectItem>
              <SelectItem value="very-aggressive">Very Aggressive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="portfolioSize">Portfolio Size</Label>
          <Select
            value={profileData.portfolioSize}
            onValueChange={(value) => handleInputChange("portfolioSize", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select portfolio size" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="under-10k">Under $10,000</SelectItem>
              <SelectItem value="10k-50k">$10,000 - $50,000</SelectItem>
              <SelectItem value="50k-250k">$50,000 - $250,000</SelectItem>
              <SelectItem value="250k-1m">$250,000 - $1,000,000</SelectItem>
              <SelectItem value="over-1m">Over $1,000,000</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="timeHorizon">Investment Time Horizon</Label>
          <Select
            value={profileData.timeHorizon}
            onValueChange={(value) => handleInputChange("timeHorizon", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select time horizon" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="short">Short-term (1-2 years)</SelectItem>
              <SelectItem value="medium">Medium-term (3-5 years)</SelectItem>
              <SelectItem value="long">Long-term (5-10 years)</SelectItem>
              <SelectItem value="very-long">
                Very long-term (10+ years)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="interests">Investment Interests & Themes</Label>
        <Textarea
          id="interests"
          placeholder="e.g., Technology stocks, ESG investing, Real Estate, Crypto, Emerging markets, Value investing..."
          value={profileData.investmentInterests}
          onChange={(e) =>
            handleInputChange("investmentInterests", e.target.value)
          }
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="additionalInfo">
          Additional Information (Optional)
        </Label>
        <Textarea
          id="additionalInfo"
          placeholder="Tell us anything else that would help us personalize your experience..."
          value={profileData.additionalInfo}
          onChange={(e) => handleInputChange("additionalInfo", e.target.value)}
          rows={3}
        />
      </div>

      <div className="flex gap-3 pt-4">
        <Button
          onClick={handleSubmit}
          className="flex-1"
          size="lg"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Completing Setup..." : "Complete Setup"}
        </Button>
        <Button
          variant="outline"
          onClick={handleSkip}
          size="lg"
          disabled={isSubmitting}
        >
          Skip for Now
        </Button>
      </div>
    </div>
  );
}


