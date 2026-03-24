"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [template, setTemplate] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/templates/${id}`).then((r) => r.json()),
      fetch(`/api/templates/${id}/steps`).then((r) => r.json()),
    ]).then(([t, s]) => {
      setTemplate(t?.error ? null : t);
      setSteps(Array.isArray(s) ? s.sort((a: any, b: any) => a.stepNumber - b.stepNumber) : []);
      setLoading(false);
    });
  }, [id]);

  async function handleDelete() {
    if (!confirm("Delete this template?")) return;
    const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Deleted");
      window.location.href = "/templates";
    } else {
      toast.error("Delete failed");
    }
  }

  if (loading) return <div className="text-zinc-500">Loading...</div>;
  if (!template) return <div className="text-red-500">Template not found</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{template.name}</h1>
          {template.description && <p className="mt-1 text-sm text-zinc-500">{template.description}</p>}
          <div className="mt-2 flex gap-2 text-xs text-zinc-400">
            <span>{template.sendingWindowStart}–{template.sendingWindowEnd}</span>
            <span>·</span>
            <span>{template.timezone}</span>
            {template.skipWeekends && <><span>·</span><span>Skip weekends</span></>}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/sequences/new?template_id=${id}`}>
            <Button size="sm">Use Template</Button>
          </Link>
          <Button size="sm" variant="destructive" onClick={handleDelete}>Delete</Button>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Steps ({steps.length})</h2>
        {steps.length === 0 ? (
          <div className="text-zinc-500 text-sm">No steps yet.</div>
        ) : (
          steps.map((step: any) => (
            <Card key={step.id}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Step {step.stepNumber}</span>
                  <div className="flex items-center gap-2">
                    {step.delayDays > 0 && (
                      <Badge variant="outline">+{step.delayDays}d</Badge>
                    )}
                    {step.isReplyThread && (
                      <Badge variant="secondary">reply thread</Badge>
                    )}
                  </div>
                </div>
                {step.subject && (
                  <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Subject: {step.subject}
                  </div>
                )}
                <div className="rounded bg-zinc-50 dark:bg-zinc-900 p-3 text-sm whitespace-pre-wrap font-mono text-xs">
                  {step.bodyTemplate}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
