"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data) => {
        setTemplates(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Templates</h1>
        <Link href="/templates/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Template
          </Button>
        </Link>
      </div>
      <p className="text-sm text-zinc-500">
        Templates are reusable step blueprints. When creating a sequence, pick a template to populate its steps automatically.
      </p>

      {loading ? (
        <div className="text-zinc-500">Loading...</div>
      ) : templates.length === 0 ? (
        <div className="py-12 text-center text-zinc-500">
          No templates yet.{" "}
          <Link href="/templates/new" className="text-blue-600 hover:underline">Create one</Link>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Steps</TableHead>
              <TableHead>Window</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((t: any) => (
              <TableRow key={t.id}>
                <TableCell>
                  <Link href={`/templates/${t.id}`} className="font-medium text-blue-600 hover:underline">
                    {t.name}
                  </Link>
                </TableCell>
                <TableCell className="text-zinc-500">{t.description || "—"}</TableCell>
                <TableCell>{t.stepCount ?? "—"}</TableCell>
                <TableCell>{t.sendingWindowStart}–{t.sendingWindowEnd} {t.timezone}</TableCell>
                <TableCell>{new Date(t.createdAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
