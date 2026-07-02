import { useState } from "react";
import {
  App,
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Table,
} from "antd";
import { CopyOutlined, PlusOutlined } from "@ant-design/icons";
import { api } from "../api";
import { useApi } from "../hooks";
import { PageHeader, Pill, Surface } from "../ui";

export default function Keys() {
  const { message } = App.useApp();
  const { data, loading, reload } = useApi(() => api.listKeys(), []);
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [form] = Form.useForm();

  const onCreate = async () => {
    const v = await form.validateFields();
    const res = await api.createKey(v.name, v.scopes);
    setSecret(res.secret);
    setOpen(false);
    form.resetFields();
    reload();
  };

  return (
    <>
      <PageHeader
        eyebrow="Access"
        title="API Keys"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setOpen(true)}
          >
            Create key
          </Button>
        }
      />

      <Surface>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={data ?? []}
          pagination={{ defaultPageSize: 12, hideOnSinglePage: true }}
          locale={{ emptyText: "No keys" }}
          columns={[
            { title: "Name", dataIndex: "name" },
            {
              title: "Prefix",
              dataIndex: "prefix",
              render: (p: string) => (
                <span
                  className="wd-mono"
                  style={{ fontSize: 12.5, color: "var(--muted)" }}
                >
                  {p}
                </span>
              ),
            },
            {
              title: "Scopes",
              dataIndex: "scopes",
              render: (s: string[]) => (
                <span
                  style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}
                >
                  {s.map((x) => (
                    <span
                      key={x}
                      className="wd-mono"
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {x}
                    </span>
                  ))}
                </span>
              ),
            },
            {
              title: "Status",
              dataIndex: "revokedAt",
              render: (r: string | null) =>
                r ? (
                  <Pill tone="red">revoked</Pill>
                ) : (
                  <Pill tone="green">active</Pill>
                ),
            },
            {
              title: "Created",
              dataIndex: "createdAt",
              render: (t: string) => (
                <span style={{ color: "var(--muted)", fontSize: 13 }}>
                  {new Date(t).toLocaleDateString()}
                </span>
              ),
            },
            {
              title: "",
              render: (_: unknown, row: any) =>
                !row.revokedAt && (
                  <Popconfirm
                    title="Revoke this key?"
                    onConfirm={async () => {
                      await api.revokeKey(row.id);
                      message.success("Key revoked");
                      reload();
                    }}
                  >
                    <Button danger size="small">
                      Revoke
                    </Button>
                  </Popconfirm>
                ),
            },
          ]}
        />
      </Surface>

      <Modal
        title="Create API key"
        open={open}
        onOk={onCreate}
        onCancel={() => setOpen(false)}
        okText="Create"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ scopes: ["ingest"] }}
          style={{ marginTop: 12 }}
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: "Name is required" }]}
          >
            <Input placeholder="e.g. ci-ingest" />
          </Form.Item>
          <Form.Item
            name="scopes"
            label="Scopes"
            rules={[{ required: true, message: "Pick at least one scope" }]}
          >
            <Select
              mode="multiple"
              options={[
                { value: "ingest" },
                { value: "read" },
                { value: "admin" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Key created - copy it now"
        open={!!secret}
        footer={null}
        onCancel={() => setSecret(null)}
      >
        <Alert
          type="success"
          showIcon
          message="This secret is shown only once."
          style={{ marginBottom: 12 }}
        />
        <Input.TextArea
          readOnly
          value={secret ?? ""}
          autoSize
          style={{ fontFamily: "var(--mono)" }}
        />
        <Button
          icon={<CopyOutlined />}
          block
          style={{ marginTop: 12 }}
          onClick={() => {
            navigator.clipboard?.writeText(secret ?? "");
            message.success("Copied to clipboard");
          }}
        >
          Copy secret
        </Button>
      </Modal>
    </>
  );
}
