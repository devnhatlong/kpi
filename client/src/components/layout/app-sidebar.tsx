"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { NAV_ITEMS, SIDEBAR_BRAND, type NavItem } from "@/constants/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { userHasAnyPermission } from "@/features/auth/types";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";

function collectNavHrefs(items: NavItem[]): string[] {
  const hrefs: string[] = [];
  for (const item of items) {
    if (item.href) hrefs.push(item.href);
    for (const child of item.children ?? []) {
      hrefs.push(child.href);
    }
  }
  return hrefs;
}

/** Active theo href khớp dài nhất - tránh /mission/personal sáng khi đang ở /mission/received. */
function isPathActive(pathname: string, href: string, allHrefs: string[]) {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }

  const matches = allHrefs
    .filter(
      (candidate) =>
        pathname === candidate || pathname.startsWith(`${candidate}/`),
    )
    .sort((a, b) => b.length - a.length);

  return matches[0] === href;
}

function hasActiveChild(pathname: string, item: NavItem, allHrefs: string[]) {
  return (
    item.children?.some((child) =>
      isPathActive(pathname, child.href, allHrefs),
    ) ?? false
  );
}

function NavGroup({ item, allHrefs }: { item: NavItem; allHrefs: string[] }) {
  const pathname = usePathname();
  const { state, isMobile } = useSidebar();
  const Icon = item.icon;

  if (!item.children?.length) {
    const href = item.href ?? "#";
    const active = isPathActive(pathname, href, allHrefs);

    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={active}
          tooltip={item.title}
          className="h-10 [&>svg]:size-5"
        >
          <Link href={href}>
            <Icon />
            <span>{item.title}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  // Icon mode: floating dropdown like the reference UI
  if (state === "collapsed" && !isMobile) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              tooltip={item.title}
              isActive={hasActiveChild(pathname, item, allHrefs)}
              className="h-10 [&>svg]:size-5 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Icon />
              <span>{item.title}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="right"
            align="start"
            sideOffset={10}
            className="min-w-52 rounded-md p-2 shadow-lg"
          >
            {item.children.map((child) => {
              const ChildIcon = child.icon;
              return (
                <DropdownMenuItem
                  key={child.href}
                  asChild
                  className="gap-2.5 rounded-md px-3 py-2.5"
                >
                  <Link href={child.href}>
                    <ChildIcon className="size-4 text-muted-foreground" />
                    <span>{child.title}</span>
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible
      defaultOpen={hasActiveChild(pathname, item, allHrefs)}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            tooltip={item.title}
            isActive={hasActiveChild(pathname, item, allHrefs)}
            className="h-10 [&>svg]:size-5 data-[state=open]:bg-sidebar-accent/60"
          >
            <Icon />
            <span>{item.title}</span>
            <ChevronDown className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="mx-0 mt-1.5 translate-x-0 gap-0.5 rounded-md border-l-0 bg-muted/60 px-1 py-1.5 dark:bg-muted/40">
            {item.children.map((child) => {
              const active = isPathActive(pathname, child.href, allHrefs);
              const ChildIcon = child.icon;
              return (
                <SidebarMenuSubItem key={child.href}>
                  <SidebarMenuSubButton
                    asChild
                    isActive={active}
                    className="h-9 translate-x-0 gap-2 rounded-md pl-7 pr-2 text-sm text-foreground hover:bg-background/70 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-none [&>svg]:size-4 [&>svg]:text-muted-foreground data-[active=true]:[&>svg]:text-sidebar-accent-foreground"
                  >
                    <Link href={child.href}>
                      <ChildIcon />
                      <span>{child.title}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export function AppSidebar() {
  const { user } = useAuth();

  // Lọc cả mục con: nhóm chỉ còn lại những trang user thật sự vào được, và
  // nhóm rỗng thì ẩn luôn thay vì bung ra một danh sách trống.
  const visibleItems = useMemo(() => {
    const items: NavItem[] = [];

    for (const item of NAV_ITEMS) {
      if (
        item.permissions?.length &&
        !userHasAnyPermission(user, item.permissions)
      ) {
        continue;
      }

      if (!item.children?.length) {
        items.push(item);
        continue;
      }

      const children = item.children.filter(
        (child) =>
          !child.permissions?.length ||
          userHasAnyPermission(user, child.permissions),
      );
      if (children.length) items.push({ ...item, children });
    }

    return items;
  }, [user]);

  const allHrefs = useMemo(() => collectNavHrefs(visibleItems), [visibleItems]);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {/*
              Logo + tên phần mềm, in hoa. Bỏ dòng tên đơn vị: nhét cả hai vào
              bề ngang này là dòng nào cũng bị cắt cụt ("Hệ thống quản lý và
              chấm đi..."), mà tên bị cắt thì để cũng như không. Tên đơn vị vẫn
              còn ở màn đăng nhập và trên tiêu đề trình duyệt.

              Cho chữ xuống dòng thay vì truncate - hai dòng ngắn đọc được trọn
              câu, một dòng dài thì không.
            */}
            <SidebarMenuButton
              size="lg"
              asChild
              tooltip={SIDEBAR_BRAND.subtitle}
              className="h-16 group-data-[collapsible=icon]:h-16 group-data-[collapsible=icon]:p-1"
            >
              <Link href="/dashboard">
                {/*
                  Thu gọn thì nhỏ lại: --sidebar-width-icon là 4rem, trừ lề của
                  header và của nút thì chỉ còn khoảng 46px - để nguyên 48px là
                  logo tràn ra ngoài.
                */}
                <div className="relative aspect-square size-12 shrink-0 group-data-[collapsible=icon]:size-10">
                  <Image
                    src={SIDEBAR_BRAND.logo}
                    alt={SIDEBAR_BRAND.title}
                    fill
                    sizes="48px"
                    className="object-contain"
                    priority
                  />
                </div>
                {/*
                  Phải là <div>, không được là <span>: sidebarMenuButtonVariants
                  ép `[&>span:last-child]:truncate` nên span sẽ bị cắt một dòng.
                  Là div thì thoát luật đó, mà vẫn dính
                  `group-data-[collapsible=icon]:[&>div:last-child]:hidden` -
                  đúng thứ cần khi thu sidebar về dạng biểu tượng.
                */}
                <div className="min-w-0 flex-1 text-left font-display text-sm font-bold uppercase leading-[1.3] tracking-wide break-words line-clamp-2">
                  {SIDEBAR_BRAND.subtitle}
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {visibleItems.map((item) => (
                <NavGroup key={item.title} item={item} allHrefs={allHrefs} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
