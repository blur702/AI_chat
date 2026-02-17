#!/usr/bin/env python3
"""Seed the ui_components table with initial drag-and-drop builder components.

Usage:
    docker exec workstation-backend python scripts/seed_ui_components.py
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import AsyncSessionLocal
from app.models.ui_component import UIComponent
from sqlalchemy import select

COMPONENTS = [
    # ── Basic ──
    {
        "name": "Button",
        "category": "basic",
        "description": "Clickable button with customizable text and style",
        "html_template": '<button class="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 min-h-[44px] w-full sm:w-auto transition-colors">{{text}}</button>',
        "framework_code": 'export function Button({ text = "Click me", variant = "primary", onClick }: { text?: string; variant?: string; onClick?: () => void }) {\n  const base = "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium min-h-[44px] w-full sm:w-auto transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2";\n  const variants: Record<string, string> = {\n    primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500",\n    secondary: "bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500",\n    danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",\n  };\n  return <button className={`${base} ${variants[variant] || variants.primary}`} onClick={onClick}>{text}</button>;\n}',
        "is_framework_specific": True,
        "framework": "react",
        "props_schema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "default": "Click me"},
                "variant": {"type": "string", "enum": ["primary", "secondary", "danger"], "default": "primary"},
            },
        },
        "tags": ["interactive", "form", "cta"],
        "is_mobile_responsive": True,
    },
    {
        "name": "Input",
        "category": "basic",
        "description": "Text input field with label and placeholder",
        "html_template": '<div class="w-full"><label class="block text-sm font-medium text-gray-700 mb-1">{{label}}</label><input type="{{type}}" placeholder="{{placeholder}}" class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm min-h-[44px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" /></div>',
        "framework_code": 'export function TextInput({ label = "Label", placeholder = "Enter text...", type = "text" }: { label?: string; placeholder?: string; type?: string }) {\n  return (\n    <div className="w-full">\n      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>\n      <input type={type} placeholder={placeholder} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm min-h-[44px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />\n    </div>\n  );\n}',
        "is_framework_specific": True,
        "framework": "react",
        "props_schema": {
            "type": "object",
            "properties": {
                "label": {"type": "string", "default": "Label"},
                "placeholder": {"type": "string", "default": "Enter text..."},
                "type": {"type": "string", "enum": ["text", "email", "password", "number", "tel", "url"], "default": "text"},
            },
        },
        "tags": ["form", "input"],
        "is_mobile_responsive": True,
    },
    {
        "name": "Textarea",
        "category": "basic",
        "description": "Multi-line text area",
        "html_template": '<div class="w-full"><label class="block text-sm font-medium text-gray-700 mb-1">{{label}}</label><textarea placeholder="{{placeholder}}" rows="{{rows}}" class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"></textarea></div>',
        "framework_code": 'export function Textarea({ label = "Label", placeholder = "Enter text...", rows = 4 }: { label?: string; placeholder?: string; rows?: number }) {\n  return (\n    <div className="w-full">\n      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>\n      <textarea placeholder={placeholder} rows={rows} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y" />\n    </div>\n  );\n}',
        "is_framework_specific": True,
        "framework": "react",
        "props_schema": {
            "type": "object",
            "properties": {
                "label": {"type": "string", "default": "Label"},
                "placeholder": {"type": "string", "default": "Enter text..."},
                "rows": {"type": "number", "default": 4},
            },
        },
        "tags": ["form", "input"],
        "is_mobile_responsive": True,
    },
    {
        "name": "Select",
        "category": "basic",
        "description": "Dropdown select field",
        "html_template": '<div class="w-full"><label class="block text-sm font-medium text-gray-700 mb-1">{{label}}</label><select class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm min-h-[44px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"><option value="">Select...</option></select></div>',
        "framework_code": 'export function Select({ label = "Label", options = ["Option 1", "Option 2"] }: { label?: string; options?: string[] }) {\n  return (\n    <div className="w-full">\n      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>\n      <select className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm min-h-[44px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white">\n        <option value="">Select...</option>\n        {options.map((o) => <option key={o} value={o}>{o}</option>)}\n      </select>\n    </div>\n  );\n}',
        "is_framework_specific": True,
        "framework": "react",
        "props_schema": {
            "type": "object",
            "properties": {
                "label": {"type": "string", "default": "Label"},
                "options": {"type": "array", "items": {"type": "string"}, "default": ["Option 1", "Option 2"]},
            },
        },
        "tags": ["form", "input"],
        "is_mobile_responsive": True,
    },
    {
        "name": "Label",
        "category": "basic",
        "description": "Text label or heading",
        "html_template": '<{{tag}} class="{{classes}}">{{text}}</{{tag}}>',
        "framework_code": 'export function Label({ text = "Heading", tag = "h2", size = "2xl" }: { text?: string; tag?: string; size?: string }) {\n  const Tag = tag as keyof JSX.IntrinsicElements;\n  return <Tag className={`font-bold text-${size} text-gray-900`}>{text}</Tag>;\n}',
        "is_framework_specific": True,
        "framework": "react",
        "props_schema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "default": "Heading"},
                "tag": {"type": "string", "enum": ["h1", "h2", "h3", "h4", "p", "span"], "default": "h2"},
                "size": {"type": "string", "enum": ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"], "default": "2xl"},
            },
        },
        "tags": ["text", "heading"],
        "is_mobile_responsive": True,
    },
    # ── Layout ──
    {
        "name": "Container",
        "category": "layout",
        "description": "Responsive centered container with max-width",
        "html_template": '<div class="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">{{children}}</div>',
        "framework_code": 'export function Container({ children, maxWidth = "7xl" }: { children: React.ReactNode; maxWidth?: string }) {\n  return <div className={`mx-auto w-full max-w-${maxWidth} px-4 sm:px-6 lg:px-8`}>{children}</div>;\n}',
        "is_framework_specific": True,
        "framework": "react",
        "props_schema": {
            "type": "object",
            "properties": {
                "maxWidth": {"type": "string", "enum": ["sm", "md", "lg", "xl", "2xl", "4xl", "6xl", "7xl"], "default": "7xl"},
            },
        },
        "tags": ["layout", "wrapper"],
        "is_mobile_responsive": True,
    },
    {
        "name": "Grid",
        "category": "layout",
        "description": "Responsive CSS Grid layout",
        "html_template": '<div class="grid grid-cols-1 sm:grid-cols-{{smCols}} lg:grid-cols-{{lgCols}} gap-{{gap}}">{{children}}</div>',
        "framework_code": 'export function Grid({ children, cols = 3, gap = 4 }: { children: React.ReactNode; cols?: number; gap?: number }) {\n  return <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${cols} gap-${gap}`}>{children}</div>;\n}',
        "is_framework_specific": True,
        "framework": "react",
        "props_schema": {
            "type": "object",
            "properties": {
                "cols": {"type": "number", "default": 3, "minimum": 1, "maximum": 12},
                "gap": {"type": "number", "default": 4, "minimum": 0, "maximum": 16},
            },
        },
        "tags": ["layout", "grid"],
        "is_mobile_responsive": True,
    },
    {
        "name": "Flex",
        "category": "layout",
        "description": "Flexible box layout with direction and alignment",
        "html_template": '<div class="flex flex-col sm:flex-{{direction}} items-{{align}} justify-{{justify}} gap-{{gap}}">{{children}}</div>',
        "framework_code": 'export function Flex({ children, direction = "row", align = "center", justify = "start", gap = 4 }: { children: React.ReactNode; direction?: string; align?: string; justify?: string; gap?: number }) {\n  return <div className={`flex flex-col sm:flex-${direction} items-${align} justify-${justify} gap-${gap}`}>{children}</div>;\n}',
        "is_framework_specific": True,
        "framework": "react",
        "props_schema": {
            "type": "object",
            "properties": {
                "direction": {"type": "string", "enum": ["row", "col", "row-reverse", "col-reverse"], "default": "row"},
                "align": {"type": "string", "enum": ["start", "center", "end", "stretch"], "default": "center"},
                "justify": {"type": "string", "enum": ["start", "center", "end", "between", "around", "evenly"], "default": "start"},
                "gap": {"type": "number", "default": 4},
            },
        },
        "tags": ["layout", "flex"],
        "is_mobile_responsive": True,
    },
    {
        "name": "Card",
        "category": "layout",
        "description": "Content card with optional title and shadow",
        "html_template": '<div class="rounded-lg border bg-white shadow-sm p-4 sm:p-6"><h3 class="text-lg font-semibold mb-2">{{title}}</h3><p class="text-sm text-gray-600">{{content}}</p></div>',
        "framework_code": 'export function Card({ title = "Card Title", content = "Card content goes here.", children }: { title?: string; content?: string; children?: React.ReactNode }) {\n  return (\n    <div className="rounded-lg border bg-white shadow-sm p-4 sm:p-6">\n      {title && <h3 className="text-lg font-semibold mb-2">{title}</h3>}\n      {content && <p className="text-sm text-gray-600">{content}</p>}\n      {children}\n    </div>\n  );\n}',
        "is_framework_specific": True,
        "framework": "react",
        "props_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "default": "Card Title"},
                "content": {"type": "string", "default": "Card content goes here."},
            },
        },
        "tags": ["layout", "card", "container"],
        "is_mobile_responsive": True,
    },
    {
        "name": "Divider",
        "category": "layout",
        "description": "Horizontal divider line",
        "html_template": '<hr class="my-{{spacing}} border-gray-200" />',
        "framework_code": 'export function Divider({ spacing = 4 }: { spacing?: number }) {\n  return <hr className={`my-${spacing} border-gray-200`} />;\n}',
        "is_framework_specific": True,
        "framework": "react",
        "props_schema": {
            "type": "object",
            "properties": {
                "spacing": {"type": "number", "default": 4},
            },
        },
        "tags": ["layout", "separator"],
        "is_mobile_responsive": True,
    },
    {
        "name": "Spacer",
        "category": "layout",
        "description": "Empty space with configurable height",
        "html_template": '<div class="h-{{height}}"></div>',
        "framework_code": 'export function Spacer({ height = 8 }: { height?: number }) {\n  return <div className={`h-${height}`} />;\n}',
        "is_framework_specific": True,
        "framework": "react",
        "props_schema": {
            "type": "object",
            "properties": {
                "height": {"type": "number", "default": 8},
            },
        },
        "tags": ["layout", "spacing"],
        "is_mobile_responsive": True,
    },
    # ── Media ──
    {
        "name": "Image",
        "category": "media",
        "description": "Responsive image with alt text and optional caption",
        "html_template": '<figure class="w-full"><img src="{{src}}" alt="{{alt}}" class="w-full h-auto rounded-lg object-cover" /><figcaption class="mt-2 text-center text-sm text-gray-500">{{caption}}</figcaption></figure>',
        "framework_code": 'export function ImageBlock({ src = "https://via.placeholder.com/800x400", alt = "Image", caption }: { src?: string; alt?: string; caption?: string }) {\n  return (\n    <figure className="w-full">\n      <img src={src} alt={alt} className="w-full h-auto rounded-lg object-cover" />\n      {caption && <figcaption className="mt-2 text-center text-sm text-gray-500">{caption}</figcaption>}\n    </figure>\n  );\n}',
        "is_framework_specific": True,
        "framework": "react",
        "props_schema": {
            "type": "object",
            "properties": {
                "src": {"type": "string", "default": "https://via.placeholder.com/800x400"},
                "alt": {"type": "string", "default": "Image"},
                "caption": {"type": "string", "default": ""},
            },
        },
        "tags": ["media", "image"],
        "is_mobile_responsive": True,
    },
    {
        "name": "PhotoGallery",
        "category": "media",
        "description": "Responsive photo gallery grid",
        "html_template": '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4"><div class="aspect-square overflow-hidden rounded-lg"><img src="{{image}}" alt="" class="h-full w-full object-cover hover:scale-105 transition-transform" /></div></div>',
        "framework_code": 'export function PhotoGallery({ images = [{ src: "https://via.placeholder.com/300", alt: "Gallery image 1" }, { src: "https://via.placeholder.com/300", alt: "Gallery image 2" }, { src: "https://via.placeholder.com/300", alt: "Gallery image 3" }, { src: "https://via.placeholder.com/300", alt: "Gallery image 4" }] }: { images?: { src: string; alt?: string }[] }) {\n  return (\n    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">\n      {images.map((image, i) => (\n        <div key={i} className="aspect-square overflow-hidden rounded-lg">\n          <img src={image.src} alt={image.alt || `Gallery image ${i + 1}`} className="h-full w-full object-cover hover:scale-105 transition-transform" />\n        </div>\n      ))}\n    </div>\n  );\n}',
        "is_framework_specific": True,
        "framework": "react",
        "props_schema": {
            "type": "object",
            "properties": {
                "images": {"type": "array", "items": {"type": "object"}, "default": [{"src": "https://via.placeholder.com/300", "alt": "Gallery image 1"}, {"src": "https://via.placeholder.com/300", "alt": "Gallery image 2"}, {"src": "https://via.placeholder.com/300", "alt": "Gallery image 3"}, {"src": "https://via.placeholder.com/300", "alt": "Gallery image 4"}]},
                "cols": {"type": "number", "default": 4},
            },
        },
        "tags": ["media", "gallery", "image"],
        "is_mobile_responsive": True,
    },
    # ── Navigation ──
    {
        "name": "Tabs",
        "category": "navigation",
        "description": "Tab navigation with content panels",
        "html_template": '<div><div class="flex border-b overflow-x-auto -mb-px"><button class="px-4 py-2 text-sm font-medium min-h-[44px] whitespace-nowrap border-b-2 border-blue-500 text-blue-600">Tab 1</button><button class="px-4 py-2 text-sm font-medium min-h-[44px] whitespace-nowrap text-gray-500 hover:text-gray-700">Tab 2</button></div><div class="p-4">Tab content</div></div>',
        "framework_code": 'export function TabsComponent({ tabs = [{ label: "Tab 1", content: "Content 1" }, { label: "Tab 2", content: "Content 2" }] }: { tabs?: { label: string; content: string }[] }) {\n  const [active, setActive] = React.useState(0);\n  return (\n    <div>\n      <div className="flex border-b overflow-x-auto -mb-px">\n        {tabs.map((tab, i) => (\n          <button key={i} onClick={() => setActive(i)} className={`px-4 py-2 text-sm font-medium min-h-[44px] whitespace-nowrap ${i === active ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-500 hover:text-gray-700"}`}>{tab.label}</button>\n        ))}\n      </div>\n      <div className="p-4">{tabs[active]?.content}</div>\n    </div>\n  );\n}',
        "is_framework_specific": True,
        "framework": "react",
        "props_schema": {
            "type": "object",
            "properties": {
                "tabs": {"type": "array", "items": {"type": "object"}, "default": [{"label": "Tab 1", "content": "Content 1"}, {"label": "Tab 2", "content": "Content 2"}]},
            },
        },
        "tags": ["navigation", "tabs"],
        "is_mobile_responsive": True,
    },
    {
        "name": "Breadcrumbs",
        "category": "navigation",
        "description": "Navigation breadcrumb trail",
        "html_template": '<nav aria-label="Breadcrumb"><ol class="flex flex-wrap items-center gap-1.5 text-sm text-gray-500"><li><a href="#" class="hover:text-gray-700">Home</a></li><li class="text-gray-300">/</li><li class="text-gray-900 font-medium">Current</li></ol></nav>',
        "framework_code": 'export function Breadcrumbs({ items = [{ label: "Home", href: "/" }, { label: "Current" }] }: { items?: { label: string; href?: string }[] }) {\n  return (\n    <nav aria-label="Breadcrumb">\n      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-gray-500">\n        {items.map((item, i) => (\n          <React.Fragment key={i}>\n            {i > 0 && <li className="text-gray-300">/</li>}\n            <li className={i === items.length - 1 ? "text-gray-900 font-medium" : ""}>\n              {item.href ? <a href={item.href} className="hover:text-gray-700">{item.label}</a> : item.label}\n            </li>\n          </React.Fragment>\n        ))}\n      </ol>\n    </nav>\n  );\n}',
        "is_framework_specific": True,
        "framework": "react",
        "props_schema": {
            "type": "object",
            "properties": {
                "items": {"type": "array", "items": {"type": "object"}, "default": [{"label": "Home", "href": "/"}, {"label": "Current"}]},
            },
        },
        "tags": ["navigation", "breadcrumb"],
        "is_mobile_responsive": True,
    },
    {
        "name": "Pagination",
        "category": "navigation",
        "description": "Page navigation with previous/next buttons",
        "html_template": '<nav class="flex items-center justify-between" aria-label="Pagination"><button class="inline-flex items-center rounded-md border px-3 py-2 text-sm min-h-[44px] hover:bg-gray-50">Previous</button><span class="text-sm text-gray-500">Page 1 of 10</span><button class="inline-flex items-center rounded-md border px-3 py-2 text-sm min-h-[44px] hover:bg-gray-50">Next</button></nav>',
        "framework_code": 'export function Pagination({ page = 1, totalPages = 10 }: { page?: number; totalPages?: number }) {\n  return (\n    <nav className="flex items-center justify-between" aria-label="Pagination">\n      <button disabled={page <= 1} className="inline-flex items-center rounded-md border px-3 py-2 text-sm min-h-[44px] hover:bg-gray-50 disabled:opacity-50">Previous</button>\n      <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>\n      <button disabled={page >= totalPages} className="inline-flex items-center rounded-md border px-3 py-2 text-sm min-h-[44px] hover:bg-gray-50 disabled:opacity-50">Next</button>\n    </nav>\n  );\n}',
        "is_framework_specific": True,
        "framework": "react",
        "props_schema": {
            "type": "object",
            "properties": {
                "page": {"type": "number", "default": 1},
                "totalPages": {"type": "number", "default": 10},
            },
        },
        "tags": ["navigation", "pagination"],
        "is_mobile_responsive": True,
    },
    # ── Forms ──
    {
        "name": "Form",
        "category": "form",
        "description": "Form wrapper with submit handling",
        "html_template": '<form class="w-full space-y-4">{{children}}<button type="submit" class="w-full sm:w-auto inline-flex items-center justify-center rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px]">Submit</button></form>',
        "framework_code": 'export function Form({ children, submitText = "Submit", onSubmit }: { children: React.ReactNode; submitText?: string; onSubmit?: (e: React.FormEvent) => void }) {\n  return (\n    <form className="w-full space-y-4" onSubmit={(e) => { e.preventDefault(); onSubmit?.(e); }}>\n      {children}\n      <button type="submit" className="w-full sm:w-auto inline-flex items-center justify-center rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px]">{submitText}</button>\n    </form>\n  );\n}',
        "is_framework_specific": True,
        "framework": "react",
        "props_schema": {
            "type": "object",
            "properties": {
                "submitText": {"type": "string", "default": "Submit"},
            },
        },
        "tags": ["form", "wrapper"],
        "is_mobile_responsive": True,
    },
    {
        "name": "FormField",
        "category": "form",
        "description": "Form field with label, input, and validation message",
        "html_template": '<div class="w-full space-y-1"><label class="block text-sm font-medium text-gray-700">{{label}}</label><input type="{{type}}" placeholder="{{placeholder}}" class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm min-h-[44px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" /><p class="text-xs text-red-500 hidden">{{errorMessage}}</p></div>',
        "framework_code": 'export function FormField({ label = "Field", placeholder = "", type = "text", error, required }: { label?: string; placeholder?: string; type?: string; error?: string; required?: boolean }) {\n  return (\n    <div className="w-full space-y-1">\n      <label className="block text-sm font-medium text-gray-700">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>\n      <input type={type} placeholder={placeholder} required={required} className={`w-full rounded-md border px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-1 ${error ? "border-red-300 focus:border-red-500 focus:ring-red-500" : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"}`} />\n      {error && <p className="text-xs text-red-500">{error}</p>}\n    </div>\n  );\n}',
        "is_framework_specific": True,
        "framework": "react",
        "props_schema": {
            "type": "object",
            "properties": {
                "label": {"type": "string", "default": "Field"},
                "placeholder": {"type": "string", "default": ""},
                "type": {"type": "string", "enum": ["text", "email", "password", "number", "tel", "url"], "default": "text"},
                "required": {"type": "boolean", "default": False},
            },
        },
        "tags": ["form", "field"],
        "is_mobile_responsive": True,
    },
]


async def seed():
    async with AsyncSessionLocal() as session:
        # Check if already seeded
        result = await session.execute(select(UIComponent).limit(1))
        if result.scalar_one_or_none():
            print("UI components already seeded. Skipping.")
            return

        for comp_data in COMPONENTS:
            component = UIComponent(**comp_data)
            session.add(component)

        await session.commit()
        print(f"Seeded {len(COMPONENTS)} UI components.")


if __name__ == "__main__":
    asyncio.run(seed())
