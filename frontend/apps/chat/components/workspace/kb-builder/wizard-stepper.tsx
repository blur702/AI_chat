"use client";

import { Check } from "lucide-react";

interface WizardStepperProps {
  currentStep: number;
  steps: string[];
  onStepClick: (step: number) => void;
}

export function WizardStepper({ currentStep, steps, onStepClick }: WizardStepperProps) {
  return (
    <div className="flex items-center gap-1 px-1">
      {steps.map((label, index) => {
        const stepNum = index + 1;
        const isActive = stepNum === currentStep;
        const isCompleted = stepNum < currentStep;

        return (
          <div key={label} className="flex items-center gap-1 flex-1">
            <button
              type="button"
              onClick={() => onStepClick(stepNum)}
              className={`
                flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors
                ${isActive
                  ? "bg-primary text-primary-foreground"
                  : isCompleted
                    ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/60"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }
              `}
            >
              {isCompleted ? (
                <Check className="h-3 w-3" />
              ) : (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-current/10 text-[10px]">
                  {stepNum}
                </span>
              )}
              <span className="hidden sm:inline">{label}</span>
            </button>
            {index < steps.length - 1 && (
              <div className={`h-px flex-1 ${isCompleted ? "bg-green-300 dark:bg-green-700" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
