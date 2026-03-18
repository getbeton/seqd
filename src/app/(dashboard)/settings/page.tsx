"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus } from "lucide-react";
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

  async function loadWebhooks() {
    const res = await fetch("/api/webhooks");
    const data = await res.json();
    setWebhooks(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    loadWebhooks();
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Webhooks */}
      <Card>
        <CardHeader>
          <CardTitle>Webhooks</CardTitle>
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
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
