"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export default function NewCampaignPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    sendingWindowStart: "08:00",
    sendingWindowEnd: "18:00",
    timezone: "UTC",
    skipWeekends: true,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      const campaign = await res.json();
      router.push(`/campaigns/${campaign.id}`);
    } else {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Create Campaign</h1>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Campaign Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Q1 Outbound — VP Sales"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="windowStart">Window Start</Label>
                <Input
                  id="windowStart"
                  type="time"
                  value={form.sendingWindowStart}
                  onChange={(e) =>
                    setForm({ ...form, sendingWindowStart: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="windowEnd">Window End</Label>
                <Input
                  id="windowEnd"
                  type="time"
                  value={form.sendingWindowEnd}
                  onChange={(e) =>
                    setForm({ ...form, sendingWindowEnd: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                placeholder="UTC"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={form.skipWeekends}
                onCheckedChange={(checked) =>
                  setForm({ ...form, skipWeekends: checked })
                }
              />
              <Label>Skip weekends</Label>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Campaign"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
