import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";

import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { cn } from "@/lib/utils/utils";

const steps = [
  {
    title: "Share your investment ideas",
    description:
      "Tell us the themes, companies, or market views you want to explore.",
  },
  {
    title: "AI agents create portfolios",
    description:
      "Specialized teams research, analyze, and construct portfolios on your behalf.",
  },
  {
    title: "Track performance",
    description:
      "Monitor how every portfolio performs so you can see what is working.",
  },
  {
    title: "Follow what works",
    description:
      "Keep the strategies that consistently print money and cut the ones that do not.",
  },
];

const pillars = [
  {
    title: "Intelligent orchestration",
    summary: "Teams of AI agents coordinate every recommendation.",
    items: [
      "Research, analysis, risk, and portfolio construction expertise in one workflow.",
      "Agents align every move to your financial goals.",
      "You get structured reasoning instead of fragmented insights.",
    ],
  },
  {
    title: "Memory and learning",
    summary: "Printer remembers what works and what does not.",
    items: [
      "Every decision improves future recommendations.",
      "Your preferences and constraints stay built into every analysis.",
      "The system highlights patterns that keep delivering returns.",
    ],
  },
  {
    title: "Money-printing focus",
    summary: "Performance is measured by how well you print money.",
    items: [
      "Risk management stays matched to your comfort level and timeline.",
      "Results center on consistent cash generation, not vanity metrics.",
      "You see clearly when a strategy is helping you or holding you back.",
    ],
  },
];

const plans = [
  {
    name: "Free waitlist",
    price: "$0 today",
    description:
      "Reserve your place for the next cohort and stay informed as we open new seats.",
    features: [
      "Save your spot in line with a quick signup.",
      "Receive product updates and sample research drops.",
      "Know exactly when activation begins for your account.",
    ],
    ctaLabel: "Sign up free",
    featured: true,
  },
  {
    name: "Individual reservation",
    price: "Paid access",
    description:
      "For investors ready to put Printer to work on their own ideas as soon as doors open.",
    features: [
      "AI agents with research, analysis, and risk expertise build portfolios for you.",
      "The system remembers the moves that print money and improves every cycle.",
      "Performance tracking stays focused on the outcomes you care about.",
    ],
    ctaLabel: "Secure your spot",
    featured: false,
  },
  {
    name: "Team reservation",
    price: "Paid access",
    description:
      "For small groups who want shared visibility into ideas, portfolios, and results.",
    features: [
      "Coordinated AI teams keep every strategy aligned with your goals.",
      "Shared memory shows what is working across the entire team.",
      "Follow-through is driven by consistent, money-printing performance data.",
    ],
    ctaLabel: "Secure your spot",
    featured: false,
  },
  {
    name: "Institution reservation",
    price: "Paid access",
    description:
      "For funds that need structured research, tailored risk controls, and clear reporting.",
    features: [
      "Specialized agents cover research, risk assessment, and portfolio construction.",
      "Your mandates stay encoded in every recommendation Printer delivers.",
      "See immediately which strategies are contributing to real returns.",
    ],
    ctaLabel: "Secure your spot",
    featured: false,
  },
];

export function WelcomePage() {
  return (
    <div className="container mx-auto max-w-6xl space-y-16 px-6 py-16">
      <section className="space-y-6 text-center">
        <span className="text-sm font-semibold uppercase tracking-wide text-primary">
          AI-guided portfolio research
        </span>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Turn investment ideas into portfolios you can track.
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Printer orchestrates specialized AI agents that research, construct,
          and monitor investment strategies so you can focus on the decisions
          that print money.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link href="/waitlist">
              Sign up free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Signing up today adds you to the waitlist. We will reach out as soon
          as your spot is ready.
        </p>
      </section>

      <section className="space-y-6">
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold">How Printer works</h2>
          <p className="text-muted-foreground">
            A simple loop keeps you focused on what matters.
          </p>
        </div>
        <ol className="grid gap-4 sm:grid-cols-2">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="rounded-lg border bg-background p-6 text-left"
            >
              <span className="text-sm font-semibold text-primary">
                Step {index + 1}
              </span>
              <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Why it works</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {pillars.map((pillar) => (
            <Card key={pillar.title}>
              <CardHeader>
                <CardTitle className="text-xl">{pillar.title}</CardTitle>
                <CardDescription>{pillar.summary}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {pillar.items.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-muted/40 p-6">
        <h2 className="text-xl font-semibold">What you can expect</h2>
        <p className="mt-2 text-muted-foreground">
          Better investment decisions that help you print money, with less
          effort and more confidence.
        </p>
      </section>

      <section className="space-y-6">
        <div className="space-y-3 text-center">
          <h2 className="text-3xl font-semibold">
            Choose how you want to reserve access
          </h2>
          <p className="text-muted-foreground">
            Every option routes to the waitlist today. Paid reservations secure
            your place so you can activate as soon as seats open.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={cn(
                "flex h-full flex-col justify-between", // ensure equal height
                plan.featured && "border-primary shadow-lg"
              )}
            >
              <div>
                <CardHeader>
                  <div className="flex items-baseline justify-between">
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    <span className="text-sm font-medium text-primary">
                      {plan.price}
                    </span>
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 text-primary" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </div>
              <CardFooter>
                <Button
                  asChild
                  size="lg"
                  className="w-full"
                  variant={plan.featured ? "default" : "outline"}
                >
                  <Link href="/waitlist">{plan.ctaLabel}</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
        <p className="text-center text-sm text-muted-foreground">
          We will confirm details before activating your account and starting
          any billing for paid plans.
        </p>
      </section>
    </div>
  );
}
