"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Plus, Play, Pause, UserPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [campaign, setCampaign] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // New step form
  const [newStep, setNewStep] = useState({
    subject: "",
    bodyTemplate: "",
    delayDays: 0,
    isReplyThread: true,
    ccRecipients: "",
    bccRecipients: "",
  });

  async function loadData() {
    const [campRes, stepsRes, enrollRes, statsRes] = await Promise.all([
      fetch(`/api/campaigns/${id}`).then((r) => r.json()),
      fetch(`/api/campaigns/${id}/steps`).then((r) => r.json()),
      fetch(`/api/campaigns/${id}/enrollments`).then((r) => r.json()),
      fetch(`/api/campaigns/${id}/stats`).then((r) => r.json()),
    ]);
    setCampaign(campRes);
    setSteps(Array.isArray(stepsRes) ? stepsRes : []);
    setEnrollments(Array.isArray(enrollRes) ? enrollRes : []);
    setStats(statsRes);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [id]);

  async function handleActivate() {
    const res = await fetch(`/api/campaigns/${id}/activate`, { method: "POST" });
    if (res.ok) {
      toast.success("Campaign activated");
      loadData();
    } else {
      const err = await res.json();
      toast.error(err.error);
    }
  }

  async function handlePause() {
    const res = await fetch(`/api/campaigns/${id}/pause`, { method: "POST" });
    if (res.ok) {
      toast.success("Campaign paused");
      loadData();
    }
  }

  async function handleResume() {
    const res = await fetch(`/api/campaigns/${id}/resume`, { method: "POST" });
    if (res.ok) {
      toast.success("Campaign resumed");
      loadData();
    }
  }

  async function handleAddStep(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/campaigns/${id}/steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newStep,
        ccRecipients: newStep.ccRecipients
          ? newStep.ccRecipients.split(",").map((s) => s.trim())
          : [],
        bccRecipients: newStep.bccRecipients
          ? newStep.bccRecipients.split(",").map((s) => s.trim())
          : [],
      }),
    });
    if (res.ok) {
      toast.success("Step added");
      setNewStep({
        subject: "",
        bodyTemplate: "",
        delayDays: 0,
        isReplyThread: true,
        ccRecipients: "",
        bccRecipients: "",
      });
      loadData();
    }
  }

  async function handleDeleteStep(stepId: string) {
    const res = await fetch(`/api/steps/${stepId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Step deleted");
      loadData();
    }
  }

  if (loading) return <div className="text-zinc-500">Loading...</div>;
  if (!campaign) return <div className="text-red-500">Campaign not found</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge
              variant={
                campaign.status === "active"
                  ? "default"
                  : campaign.status === "paused"
                  ? "secondary"
                  : "outline"
              }
            >
              {campaign.status}
            </Badge>
            <span className="text-sm text-zinc-500">
              {campaign.timezone} | {campaign.sendingWindowStart}–
              {campaign.sendingWindowEnd}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {campaign.status === "draft" && (
            <Button onClick={handleActivate}>
              <Play className="mr-2 h-4 w-4" />
              Activate
            </Button>
          )}
          {campaign.status === "active" && (
            <>
              <Link href={`/campaigns/${id}/enroll`}>
                <Button variant="outline">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Enroll
                </Button>
              </Link>
              <Button variant="outline" onClick={handlePause}>
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </Button>
            </>
          )}
          {campaign.status === "paused" && (
            <Button onClick={handleResume}>
              <Play className="mr-2 h-4 w-4" />
              Resume
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats?.contactStatuses && (
        <div className="grid gap-3 md:grid-cols-6">
          {["not_sent", "active", "paused", "finished", "bounced", "failed"].map(
            (status) => (
              <Card key={status}>
                <CardContent className="py-3 text-center">
                  <div className="text-lg font-bold">
                    {stats.contactStatuses[status] || 0}
                  </div>
                  <div className="text-xs text-zinc-500">{status.replace("_", " ")}</div>
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}

      <Tabs defaultValue="steps">
        <TabsList>
          <TabsTrigger value="steps">Steps ({steps.length})</TabsTrigger>
          <TabsTrigger value="enrollments">
            Enrollments ({enrollments.length})
          </TabsTrigger>
        </TabsList>

        {/* Steps tab */}
        <TabsContent value="steps" className="space-y-4">
          {steps.map((step) => (
            <Card key={step.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">
                    Step {step.stepNumber}
                    {step.delayDays > 0 && (
                      <span className="ml-2 text-zinc-500 font-normal">
                        +{step.delayDays} day{step.delayDays > 1 ? "s" : ""}
                      </span>
                    )}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteStep(step.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-medium">{step.subject}</div>
                <div className="mt-1 text-sm text-zinc-500 line-clamp-3 whitespace-pre-wrap">
                  {step.bodyTemplate}
                </div>
                {step.bccRecipients?.length > 0 && (
                  <div className="mt-2 text-xs text-zinc-400">
                    BCC: {(step.bccRecipients as string[]).join(", ")}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Add step form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Add Step</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddStep} className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Subject</Label>
                  <Input
                    value={newStep.subject}
                    onChange={(e) =>
                      setNewStep({ ...newStep, subject: e.target.value })
                    }
                    placeholder="{Hey|Hi} {{first_name}}, quick question"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Body (supports spintax + variables)</Label>
                  <Textarea
                    value={newStep.bodyTemplate}
                    onChange={(e) =>
                      setNewStep({ ...newStep, bodyTemplate: e.target.value })
                    }
                    placeholder="Hi {{first_name | default('there')}},&#10;&#10;I noticed {{company}} is..."
                    rows={6}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Delay (days after previous step)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={newStep.delayDays}
                      onChange={(e) =>
                        setNewStep({ ...newStep, delayDays: parseInt(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">BCC (comma-separated)</Label>
                    <Input
                      value={newStep.bccRecipients}
                      onChange={(e) =>
                        setNewStep({ ...newStep, bccRecipients: e.target.value })
                      }
                      placeholder="bcc@attio.com"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newStep.isReplyThread}
                    onCheckedChange={(checked) =>
                      setNewStep({ ...newStep, isReplyThread: checked })
                    }
                  />
                  <Label className="text-xs">Send as reply in same thread</Label>
                </div>
                <Button type="submit" size="sm">
                  <Plus className="mr-1 h-3 w-3" />
                  Add Step
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Enrollments tab */}
        <TabsContent value="enrollments">
          {enrollments.length === 0 ? (
            <div className="py-8 text-center text-zinc-500">
              No contacts enrolled yet.
              {campaign.status === "active" && (
                <Link href={`/campaigns/${id}/enroll`} className="ml-1 text-blue-600 hover:underline">
                  Enroll contacts
                </Link>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Step</TableHead>
                  <TableHead>Last Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollments.map((row: any) => (
                  <TableRow key={row.enrollment.id}>
                    <TableCell>
                      <div className="font-medium">
                        {row.contact.firstName} {row.contact.lastName}
                      </div>
                      <div className="text-xs text-zinc-500">{row.contact.email}</div>
                    </TableCell>
                    <TableCell>{row.contact.company}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.enrollment.status}</Badge>
                    </TableCell>
                    <TableCell>{row.enrollment.currentStepNumber || "—"}</TableCell>
                    <TableCell>
                      {row.enrollment.lastSentAt
                        ? new Date(row.enrollment.lastSentAt).toLocaleDateString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
