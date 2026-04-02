"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function MailboxesPage() {
  const [mailboxes, setMailboxes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; email: string } | null>(null);
  const [pendingStepCount, setPendingStepCount] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const searchParams = useSearchParams();

  async function loadMailboxes() {
    const res = await fetch("/api/mailboxes");
    const data = await res.json();
    setMailboxes(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    loadMailboxes();
  }, []);

  useEffect(() => {
    const error = searchParams.get("error");
    const success = searchParams.get("success");
    if (error) {
      toast.error(`Mailbox OAuth failed: ${decodeURIComponent(error)}`);
      window.history.replaceState({}, "", "/mailboxes");
    } else if (success === "true") {
      toast.success("Mailbox connected successfully!");
      window.history.replaceState({}, "", "/mailboxes");
    }
  }, [searchParams]);

  async function handleAddMailbox() {
    const res = await fetch("/api/mailboxes/auth/start", { method: "POST" });
    const data = await res.json();
    if (data.auth_url) {
      window.open(data.auth_url, "_blank");
      toast.info("Complete the OAuth flow in the new tab, then refresh this page.");
    } else {
      toast.error("Failed to start OAuth flow");
    }
  }

  async function handleUpdateLimit(id: string, dailyLimit: number) {
    await fetch(`/api/mailboxes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dailyLimit }),
    });
    toast.success("Limit updated");
    loadMailboxes();
  }

  async function confirmDelete(id: string, email: string) {
    setDeleteTarget({ id, email });
    try {
      const res = await fetch(`/api/mailboxes/${id}/pending-steps`);
      const data = await res.json();
      setPendingStepCount(data.count ?? 0);
    } catch {
      setPendingStepCount(0);
    }
  }

  async function executeDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/mailboxes/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.cancelledSteps > 0) {
        toast.success(`Mailbox removed. ${data.cancelledSteps} pending step(s) cancelled.`);
      } else {
        toast.success("Mailbox removed");
      }
      loadMailboxes();
    } catch {
      toast.error("Failed to remove mailbox");
    }
    setDeleteTarget(null);
    setPendingStepCount(0);
    setDeleting(false);
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    await fetch(`/api/mailboxes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    loadMailboxes();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mailboxes</h1>
        <Button onClick={handleAddMailbox}>
          <Plus className="mr-2 h-4 w-4" />
          Add Mailbox
        </Button>
      </div>

      {loading ? (
        <div className="text-zinc-500">Loading...</div>
      ) : mailboxes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-zinc-500">
            No mailboxes connected. Add a Gmail mailbox to start sending.
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Display Name</TableHead>
              <TableHead>Daily Limit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mailboxes.map((mb) => (
              <TableRow key={mb.id}>
                <TableCell className="font-medium">{mb.email}</TableCell>
                <TableCell>{mb.displayName}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={1}
                    className="w-20"
                    defaultValue={mb.dailyLimit}
                    onBlur={(e) =>
                      handleUpdateLimit(mb.id, parseInt(e.target.value))
                    }
                  />
                </TableCell>
                <TableCell>
                  <Badge
                    variant={mb.isActive ? "default" : "secondary"}
                    className="cursor-pointer"
                    onClick={() => handleToggleActive(mb.id, !mb.isActive)}
                  >
                    {mb.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => confirmDelete(mb.id, mb.email)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4">
            <CardContent className="pt-6 space-y-4">
              <h2 className="text-lg font-semibold">Remove mailbox</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Are you sure you want to remove <strong>{deleteTarget.email}</strong>?
              </p>
              {pendingStepCount > 0 && (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  This will cancel <strong>{pendingStepCount}</strong> pending sequence step{pendingStepCount !== 1 ? "s" : ""} using this mailbox.
                </p>
              )}
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setDeleteTarget(null); setPendingStepCount(0); }}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={executeDelete}
                  disabled={deleting}
                >
                  {deleting ? "Removing..." : "Remove"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
