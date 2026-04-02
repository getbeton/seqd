"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

const statusColor: Record<string, string> = {
  sent: "text-green-600",
  pending: "text-zinc-400",
  scheduled: "text-blue-500",
  failed: "text-red-500",
  skipped: "text-zinc-400 line-through",
  cancelled: "text-zinc-400 line-through",
};

export default function SequenceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [seq, setSeq] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ subject: "", body: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    const data = await fetch(`/api/sequences/${id}`).then((r) => r.json());
    setSeq(data?.error ? null : data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function action(a: string) {
    setActing(true);
    const res = await fetch(`/api/sequences/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: a }),
    });
    if (res.ok) {
      toast.success(`${a} done`);
      load();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed");
    }
    setActing(false);
  }

  function startEditing(step: any) {
    setEditingStep(step.id);
    setEditForm({
      subject: step.subject || "",
      body: step.body || step.bodyPreview || "",
    });
  }

  function cancelEditing() {
    setEditingStep(null);
    setEditForm({ subject: "", body: "" });
  }

  async function saveStep(stepId: string) {
    setSaving(true);
    const res = await fetch(`/api/sequence-steps/${stepId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: editForm.subject, body: editForm.body }),
    });
    if (res.ok) {
      toast.success("Step updated");
      setEditingStep(null);
      setEditForm({ subject: "", body: "" });
      load();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to update step");
    }
    setSaving(false);
  }

  if (loading) return <div className="text-zinc-500">Loading...</div>;
  if (!seq) return <div className="text-red-500">Sequence not found</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/sequences">Sequences</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{seq.contact?.firstName} {seq.contact?.lastName}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {seq.contact?.firstName} {seq.contact?.lastName}
          </h1>
          <div className="mt-1 text-sm text-zinc-500">
            {seq.contact?.email}
            {seq.contact?.company && ` · ${seq.contact.company}`}
            {seq.contact?.title && ` · ${seq.contact.title}`}
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <Badge variant={seq.status === "active" ? "default" : seq.status === "finished" ? "outline" : "secondary"}>
              {seq.status}
            </Badge>
            {seq.template && (
              <Link href={`/templates/${seq.template.id}`}>
                <Badge variant="outline" className="cursor-pointer hover:bg-zinc-100">
                  📄 {seq.template.name}
                </Badge>
              </Link>
            )}
            {seq.campaign && (
              <Link href={`/campaigns/${seq.campaign.id}`}>
                <Badge variant="outline" className="cursor-pointer hover:bg-zinc-100">
                  📁 {seq.campaign.name}
                </Badge>
              </Link>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {seq.status === "active" && (
            <Button size="sm" variant="outline" disabled={acting} onClick={() => action("pause")}>Pause</Button>
          )}
          {seq.status === "paused" && (
            <Button size="sm" disabled={acting} onClick={() => action("resume")}>Resume</Button>
          )}
          {["active", "paused"].includes(seq.status) && (
            <>
              <Button size="sm" variant="outline" disabled={acting} onClick={() => action("skip")}>Skip Next</Button>
              <Button size="sm" variant="outline" disabled={acting} onClick={() => action("send_now")}>Send Now</Button>
            </>
          )}
        </div>
      </div>

      {/* Step timeline */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Steps</h2>
        {(seq.steps || []).map((step: any) => (
          <Card key={step.stepNumber} className={step.status === "sent" ? "border-green-200 dark:border-green-900" : ""}>
            <CardContent className="pt-4">
              {editingStep === step.id ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">Editing Step {step.stepNumber}</span>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`subject-${step.id}`}>Subject</Label>
                    <Input
                      id={`subject-${step.id}`}
                      value={editForm.subject}
                      onChange={(e) => setEditForm((f) => ({ ...f, subject: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`body-${step.id}`}>Body</Label>
                    <Textarea
                      id={`body-${step.id}`}
                      rows={5}
                      value={editForm.body}
                      onChange={(e) => setEditForm((f) => ({ ...f, body: e.target.value }))}
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={cancelEditing} disabled={saving}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={() => saveStep(step.id)} disabled={saving}>
                      {saving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Step {step.stepNumber}</span>
                      {step.delayDays > 0 && <span className="text-xs text-zinc-400">+{step.delayDays}d</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {step.status !== "sent" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => startEditing(step)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <span className={`text-xs font-medium ${statusColor[step.status] || ""}`}>
                        {step.status}
                        {step.sentAt && ` · ${new Date(step.sentAt).toLocaleDateString()}`}
                        {step.scheduledAt && step.status !== "sent" && ` · scheduled ${new Date(step.scheduledAt).toLocaleDateString()}`}
                      </span>
                    </div>
                  </div>
                  {step.subject && (
                    <div className="text-sm font-medium mb-1">{step.subject}</div>
                  )}
                  {step.bodyPreview && (
                    <div className="text-xs text-zinc-500 bg-zinc-50 dark:bg-zinc-900 rounded p-2 line-clamp-3">
                      {step.bodyPreview}
                    </div>
                  )}
                  {step.events && step.events.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {step.events.map((ev: any, i: number) => (
                        <div key={i} className="text-xs text-zinc-500 flex items-start gap-2">
                          <Badge variant="outline" className="shrink-0">{ev.type}</Badge>
                          {ev.replyText && (
                            <span className="line-clamp-2">{ev.replyText.slice(0, 200)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
