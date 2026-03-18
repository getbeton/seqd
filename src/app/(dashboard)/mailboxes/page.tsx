"use client";

import { useEffect, useState } from "react";
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

  async function loadMailboxes() {
    const res = await fetch("/api/mailboxes");
    const data = await res.json();
    setMailboxes(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    loadMailboxes();
  }, []);

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

  async function handleDelete(id: string) {
    await fetch(`/api/mailboxes/${id}`, { method: "DELETE" });
    toast.success("Mailbox removed");
    loadMailboxes();
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
                    onClick={() => handleDelete(mb.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
