"use client";

import { format } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils/utils";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Input } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

interface DateTimePickerProps {
  date?: Date;
  onDateChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  showTime?: boolean;
}

export function DateTimePicker({
  date,
  onDateChange,
  placeholder = "Pick a date and time",
  disabled = false,
  className,
  showTime = true,
}: DateTimePickerProps) {
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(
    date
  );
  const [timeValue, setTimeValue] = React.useState<string>(() => {
    if (date) {
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      return `${hours}:${minutes}`;
    }
    return "";
  });

  React.useEffect(() => {
    setSelectedDate(date);
    if (date) {
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      setTimeValue(`${hours}:${minutes}`);
    } else {
      setTimeValue("");
    }
  }, [date]);

  const handleDateSelect = (newDate: Date | undefined) => {
    if (!newDate) {
      setSelectedDate(undefined);
      onDateChange(undefined);
      return;
    }

    // Preserve time if we have a time value
    if (timeValue) {
      const [hours, minutes] = timeValue.split(":").map(Number);
      newDate.setHours(hours, minutes, 0, 0);
    } else {
      // Default to current time if no time set
      const now = new Date();
      newDate.setHours(now.getHours(), now.getMinutes(), 0, 0);
    }

    setSelectedDate(newDate);
    onDateChange(newDate);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value;
    setTimeValue(newTime);

    if (newTime && selectedDate) {
      const [hours, minutes] = newTime.split(":").map(Number);
      const updatedDate = new Date(selectedDate);
      updatedDate.setHours(hours, minutes, 0, 0);
      setSelectedDate(updatedDate);
      onDateChange(updatedDate);
    } else if (newTime && !selectedDate) {
      // If no date selected, create one with today's date
      const today = new Date();
      const [hours, minutes] = newTime.split(":").map(Number);
      today.setHours(hours, minutes, 0, 0);
      setSelectedDate(today);
      onDateChange(today);
    }
  };

  const displayText = React.useMemo(() => {
    if (!selectedDate) return placeholder;
    if (showTime && timeValue) {
      return format(selectedDate, "PPP 'at' p");
    }
    return format(selectedDate, "PPP");
  }, [selectedDate, timeValue, placeholder, showTime]);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={"outline"}
            className={cn(
              "w-full justify-start text-left font-normal",
              !selectedDate && "text-muted-foreground"
            )}
            disabled={disabled}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {displayText}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="p-3">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              initialFocus
            />
            {showTime && (
              <div className="border-t p-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="time"
                    value={timeValue}
                    onChange={handleTimeChange}
                    className="w-full"
                    disabled={disabled}
                  />
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
