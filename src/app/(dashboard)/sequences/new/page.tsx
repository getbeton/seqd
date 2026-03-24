"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Suspense } from "react";

function NewSequenceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [contacts, setContacts] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    contact_id: "",
    template_id: searchParams.get("template_id") || "",
    campaign_id: searchParams.get("campaign_id") || "",
    sending_window_start: "08:00",
    sending_window_end: "18:00",
    timezone: "UTC",
    skip_weekends: true,
  });
  const [steps, setSteps] = useState([{ subject: "", body: "", delay_days: 0 }]);

  useEffect(() => {
    Promise.all([
      fetch("/api/contacts?limit=200").then((r) => r.json()),
      fetch("/api/templates").then((r) => r.json()),
      fetch("/api/campaigns").then((r) => r.json()),
    ]).then(([c, t, camp]) => {
      setContacts(c.data || []);
      setTemplates(Array.isArray(t) ? t : []);
      setCampaigns(Array.isArray(camp) ? camp : []);
      setLoading(false);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.contact_id) { toast.error("Select a contact"); return; }

    setSaving(true);
    const payload: any = {
      contact_id: form.contact_id,
      sending_window_start: form.sending_window_start,
      sending_window_end: form.sending_window_end,
      timezone: form.timezone,
      skip_weekends: form.skip_weekends,
    };
    if (form.campaign_id) payload.campaign_id = form.campaign_id;
    if (form.template_id) {
      payload.template_id = form.template_id;
    } else {
      if (steps.some(s => !s.body)) { toast.error("All steps need a body"); setSaving(false); return; }
      payload.steps = steps;
    }

    const res = await fetch("/api/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const seq = await res.json();
      toast.success("Sequence created");
      router.push(`/sequences/${seq.sequence?.id || seq.id}`);
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed");
      setSaving(false);
    }
  }

  if (loading) return <div className="text-zinc-500">Loading...</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">New Sequence</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label>Contact *</Label>
              <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.contact_id} onChange={(e) => setForm({ ...form, contact_id: e.target.value })} required>
                <option value="">Select a contact...</option>
                {contacts.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName} — {c.email}{c.company ? ` (${c.company})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Campaign (optional)</Label>
              <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.campaign_id} onChange={(e) => setForm({ ...form, campaign_id: e.target.value })}>
                <option value="">No campaign</option>
                {campaigns.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label>Template</Label>
              <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.template_id} onChange={(e) => setForm({ ...form, template_id: e.target.value })}>
                <option value="">Write steps manually</option>
                {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            {!form.template_id && (
              <div className="space-y-3">
                {steps.map((step, i) => (
                  <div key={i} className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Step {i + 1}</span>
                      {steps.length > 1 && (
                        <Button type="button" variant="ghost" size="sm"
                          onClick={() => setSteps(steps.filter((_, idx) => idx !== i))}>Remove</Button>
                      )}
                    </div>
                    <Input placeholder="Subject (optional)" value={step.subject}
                      onChange={(e) => { const s = [...steps]; s[i].subject = e.target.value; setSteps(s); }} />
                    <Textarea placeholder="Body *" value={step.body} rows={4}
                      onChange={(e) => { const s = [...steps]; s[i].body = e.target.value; setSteps(s); }} />
                    {i > 0 && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Delay (days)</Label>
                        <Input type="number" min={0} className="w-20" value={step.delay_days}
                          onChange={(e) => { const s = [...steps]; s[i].delay_days = parseInt(e.target.value) || 0; setSteps(s); }} />
                      </div>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm"
                  onClick={() => setSteps([...steps, { subject: "", body: "", delay_days: 3 }])}>
                  + Add Step
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-3">
            <Label className="font-semibold">Sending Window</Label>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Start</Label>
                <Input type="time" value={form.sending_window_start}
                  onChange={(e) => setForm({ ...form, sending_window_start: e.target.value })} /></div>
              <div><Label className="text-xs">End</Label>
                <Input type="time" value={form.sending_window_end}
                  onChange={(e) => setForm({ ...form, sending_window_end: e.target.value })} /></div>
            </div>
            <div><Label className="text-xs">Timezone</Label>
              <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></div>
            <div className="flex items-center gap-2">
              <Switch checked={form.skip_weekends} onCheckedChange={(v) => setForm({ ...form, skip_weekends: v })} />
              <Label className="text-xs">Skip weekends</Label>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create Sequence"}</Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}

export default function NewSequencePage() {
  return <Suspense fallback={<div className="text-zinc-500">Loading...</div>}><NewSequenceForm /></Suspense>;
}
