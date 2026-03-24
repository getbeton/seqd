"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export default function NewTemplatePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    sending_window_start: "08:00",
    sending_window_end: "18:00",
    timezone: "UTC",
    skip_weekends: true,
  });
  const [steps, setSteps] = useState([
    { subject: "", body_template: "", delay_days: 0, is_reply_thread: true },
  ]);

  function addStep() {
    setSteps([...steps, { subject: "", body_template: "", delay_days: 3, is_reply_thread: true }]);
  }

  function removeStep(i: number) {
    setSteps(steps.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) { toast.error("Name is required"); return; }
    if (steps.some(s => !s.body_template)) { toast.error("All steps need a body"); return; }

    setSaving(true);

    // Create template
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description || null,
        sending_window_start: form.sending_window_start,
        sending_window_end: form.sending_window_end,
        timezone: form.timezone,
        skip_weekends: form.skip_weekends,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error || "Failed to create template");
      setSaving(false);
      return;
    }

    const template = await res.json();

    // Add steps
    for (let i = 0; i < steps.length; i++) {
      const stepRes = await fetch(`/api/templates/${template.id}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...steps[i], step_number: i + 1 }),
      });
      if (!stepRes.ok) {
        toast.error(`Failed to save step ${i + 1}`);
        setSaving(false);
        return;
      }
    }

    toast.success("Template created");
    router.push(`/templates/${template.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">New Template</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., 3-step cold outreach" required />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="When to use this template..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Window Start</Label>
                <Input type="time" value={form.sending_window_start}
                  onChange={(e) => setForm({ ...form, sending_window_start: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Window End</Label>
                <Input type="time" value={form.sending_window_end}
                  onChange={(e) => setForm({ ...form, sending_window_end: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Timezone</Label>
              <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.skip_weekends}
                onCheckedChange={(v) => setForm({ ...form, skip_weekends: v })} />
              <Label className="text-xs">Skip weekends</Label>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Label className="text-base font-semibold">Steps</Label>
          <p className="text-xs text-zinc-500">Use {`{{firstName}}`}, {`{{company}}`}, {`{{title}}`} as variables — resolved when a sequence is created from this template.</p>
          {steps.map((step, i) => (
            <Card key={i}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Step {i + 1}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">
                      {i === 0 ? "Sent on day 1" : `+${step.delay_days} day${step.delay_days !== 1 ? "s" : ""} after prev`}
                    </span>
                    {steps.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeStep(i)}>Remove</Button>
                    )}
                  </div>
                </div>
                <Input placeholder="Subject (optional for follow-ups)"
                  value={step.subject}
                  onChange={(e) => { const s = [...steps]; s[i].subject = e.target.value; setSteps(s); }} />
                <Textarea placeholder="Body template — use {{firstName}}, {{company}}, etc."
                  value={step.body_template}
                  onChange={(e) => { const s = [...steps]; s[i].body_template = e.target.value; setSteps(s); }}
                  rows={5} />
                {i > 0 && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Delay (days)</Label>
                    <Input type="number" min={1} className="w-20"
                      value={step.delay_days}
                      onChange={(e) => { const s = [...steps]; s[i].delay_days = parseInt(e.target.value) || 1; setSteps(s); }} />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Switch checked={step.is_reply_thread}
                    onCheckedChange={(v) => { const s = [...steps]; s[i].is_reply_thread = v; setSteps(s); }} />
                  <Label className="text-xs">Send as reply in same thread</Label>
                </div>
              </CardContent>
            </Card>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addStep}>+ Add Step</Button>
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create Template"}</Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
