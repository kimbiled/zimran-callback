"use client";
// antd in the site's dark theme: same orange, radius and font as the rest of the UI.

import { ConfigProvider, theme } from "antd";

export function AntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#ff5c26",
          colorInfo: "#7c5cff",
          colorSuccess: "#4ade80",
          colorError: "#fb7185",
          colorBgBase: "#05050a",
          colorBgContainer: "#13131d",
          colorBgElevated: "#1d1d2a",
          colorBorder: "#262634",
          colorText: "#f4f4f8",
          colorTextSecondary: "#a4a4b8",
          borderRadius: 14,
          fontFamily: "var(--font-geist), ui-sans-serif, system-ui, sans-serif",
        },
        components: {
          Segmented: {
            itemSelectedBg: "#ff5c26",
            itemSelectedColor: "#0a0508",
            trackBg: "rgba(255,255,255,0.05)",
            itemColor: "#a4a4b8",
            itemHoverColor: "#f4f4f8",
          },
          Tooltip: { colorBgSpotlight: "#1d1d2a" },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
