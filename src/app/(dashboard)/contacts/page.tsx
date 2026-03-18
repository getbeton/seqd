"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload } from "lucide-react";
import { toast } from "sonner";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadContacts() {
    setLoading(true);
    const res = await fetch(`/api/contacts?search=${search}&limit=100`);
    const data = await res.json();
    setContacts(data.data || []);
    setTotal(data.total || 0);
    setLoading(false);
  }

  useEffect(() => {
    loadContacts();
  }, [search]);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/contacts/import", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    toast.success(
      `Imported ${data.imported} contacts (${data.skipped} skipped)`
    );
    loadContacts();
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Contacts</h1>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImport}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Input
          placeholder="Search contacts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <span className="text-sm text-zinc-500">{total} contacts</span>
      </div>

      {loading ? (
        <div className="text-zinc-500">Loading...</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((contact) => (
              <TableRow key={contact.id}>
                <TableCell className="font-medium">{contact.email}</TableCell>
                <TableCell>
                  {contact.firstName} {contact.lastName}
                </TableCell>
                <TableCell>{contact.company}</TableCell>
                <TableCell>{contact.title}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      contact.status === "active" ? "default" : "secondary"
                    }
                  >
                    {contact.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
