"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, CheckCircle2, XCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

const EVENT_TYPES = [
  "email.sent",
  "email.replied",
  "email.bounced",
];

export default function SettingsPage() {
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<Set<string>>(new Set());

  // Tracking domain state
  const [trackingDomain, setTrackingDomain] = useState("");
  const [trackingDomainVerified, setTrackingDomainVerified] = useState(false);
  const [openTracking, setOpenTracking] = useState(true);
  const [clickTracking, setClickTracking] = useState(true);
  const [unsubscribeEnabled, setUnsubscribeEnabled] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [savingTracking, setSavingTracking] = useState(false);

  async function loadWebhooks() {
    const res = await fetch("/api/webhooks");
    const data = await res.json();
    setWebhooks(Array.isArray(data) ? data : []);
  }

  async function loadTrackingSettings() {
    const res = await fetch("/api/tracking-domain");
    const data = await res.json();
    setTrackingDomain(data.trackingDomain || "");
    setTrackingDomainVerified(data.trackingDomainVerified || false);
    setOpenTracking(data.openTrackingEnabled ?? true);
    setClickTracking(data.clickTrackingEnabled ?? true);
    setUnsubscribeEnabled(data.unsubscribeLinkEnabled ?? true);
  }

  useEffect(() => {
    loadWebhooks();
    loadTrackingSettings();
  }, []);

  async function handleAddWebhook(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: newUrl, events: Array.from(newEvents) }),
    });
    toast.success("Webhook added");
    setNewUrl("");
    setNewEvents(new Set());
    loadWebhooks();
  }

  async function handleDeleteWebhook(id: string) {
    await fetch(`/api/webhooks/${id}`, { method: "DELETE" });
    toast.success("Webhook removed");
    loadWebhooks();
  }

  function toggleEvent(event: string) {
    const next = new Set(newEvents);
    if (next.has(event)) next.delete(event);
    else next.add(event);
    setNewEvents(next);
  }

  async function handleSaveTracking() {
    setSavingTracking(true);
    try {
      const res = await fetch("/api/tracking-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackingDomain: trackingDomain || null,
          openTrackingEnabled: openTracking,
          clickTrackingEnabled: clickTracking,
          unsubscribeLinkEnabled: unsubscribeEnabled,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTrackingDomainVerified(data.trackingDomainVerified || false);
        toast.success("Tracking settings saved");
      } else {
        toast.error("Failed to save tracking settings");
      }
    } finally {
      setSavingTracking(false);
    }
  }

  async function handleVerifyDomain() {
    if (!trackingDomain) {
      toast.error("Enter a tracking domain first");
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch("/api/tracking-domain/verify", { method: "POST" });
      const data = await res.json();
      if (data.verified) {
        setTrackingDomainVerified(true);
        toast.success("Tracking domain verified!");
      } else {
        setTrackingDomainVerified(false);
        toast.error(data.error || "Domain verification failed");
      }
    } catch {
      toast.error("Verification request failed");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Tracking Domain */}
      <Card>
        <CardHeader>
          <CardTitle>Tracking Domain</CardTitle>
          <CardDescription>
            Set up a custom tracking domain for open/click tracking and unsubscribe links.
            This improves email deliverability by aligning tracking URLs with your sending domain.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Custom Domain</Label>
            <div className="flex items-center gap-2">
              <Input
                value={trackingDomain}
                onChange={(e) => {
                  setTrackingDomain(e.target.value);
                  if (e.target.value !== trackingDomain) setTrackingDomainVerified(false);
                }}
                placeholder="track.yourdomain.com"
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={handleVerifyDomain}
                disabled={verifying || !trackingDomain}
              >
                {verifying ? "Checking..." : "Verify"}
              </Button>
              {trackingDomain && (
                trackingDomainVerified ? (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <XCircle className="h-3 w-3" />
                    Unverified
                  </Badge>
                )
              )}
            </div>
            <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium">CNAME Setup Instructions:</p>
              <p>1. Go to your DNS provider (Cloudflare, Route 53, etc.)</p>
              <p>2. Add a CNAME record:</p>
              <p className="font-mono ml-4">
                {trackingDomain || "track.yourdomain.com"} → cname.vercel-dns.com
              </p>
              <p>3. Wait for DNS propagation (up to 48h), then click Verify</p>
              <p>4. Vercel will automatically provision an SSL certificate</p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <Label className="text-sm font-medium">Tracking Features</Label>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Open Tracking</Label>
                <p className="text-xs text-muted-foreground">Track when recipients open your emails via a 1x1 tracking pixel</p>
              </div>
              <Switch checked={openTracking} onCheckedChange={setOpenTracking} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Click Tracking</Label>
                <p className="text-xs text-muted-foreground">Track when recipients click links in your emails</p>
              </div>
              <Switch checked={clickTracking} onCheckedChange={setClickTracking} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Unsubscribe Links</Label>
                <p className="text-xs text-muted-foreground">
                  Add List-Unsubscribe headers and footer link (required by Gmail/Yahoo for bulk senders)
                </p>
              </div>
              <Switch checked={unsubscribeEnabled} onCheckedChange={setUnsubscribeEnabled} />
            </div>
          </div>

          <Button onClick={handleSaveTracking} disabled={savingTracking}>
            {savingTracking ? "Saving..." : "Save Tracking Settings"}
          </Button>
        </CardContent>
      </Card>

      {/* Webhooks */}
      <Card>
        <CardHeader>
          <CardTitle>Webhooks</CardTitle>
          <p className="text-sm text-muted-foreground">
            Webhooks send outbound HTTP POST notifications to your URL when events occur (e.g. email sent, reply received, bounce).
            Use them to integrate with your CRM, Slack, or other tools.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {webhooks.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.map((wh) => (
                  <TableRow key={wh.id}>
                    <TableCell className="font-mono text-xs">{wh.url}</TableCell>
                    <TableCell>
                      {(wh.events as string[]).join(", ")}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteWebhook(wh.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <form onSubmit={handleAddWebhook} className="space-y-3">
            <div className="space-y-1">
              <Label>Webhook URL</Label>
              <Input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://example.com/webhook"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Events</Label>
              <div className="flex flex-wrap gap-3">
                {EVENT_TYPES.map((event) => (
                  <label key={event} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={newEvents.has(event)}
                      onCheckedChange={() => toggleEvent(event)}
                    />
                    {event}
                  </label>
                ))}
              </div>
            </div>
            <Button type="submit" size="sm">
              <Plus className="mr-1 h-3 w-3" />
              Add Webhook
            </Button>
            <p className="text-xs text-muted-foreground">
              Payload format: <code className="rounded bg-muted px-1 py-0.5">{"{"} "event": "email.sent", "data": {"{"} "contactEmail": "...", "campaignId": "...", "stepNumber": 1 {"}"} {"}"}</code>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
