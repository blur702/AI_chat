
"""
Script to insert comprehensive help topics for all fields/settings.
"""

# Ensure the app module is importable when running directly
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import asyncio
from app.database import AsyncSessionLocal
from app.services.help_manager import HelpManager

HELP_TOPICS = [
    {
        "slug": "settings-first-name",
        "section_id": "profile",
        "title": "First Name",
        "body": "Enter your given name. This will be used for personalization and may be visible to other users.",
        "tags": ["profile", "user"]
    },
    {
        "slug": "settings-last-name",
        "section_id": "profile",
        "title": "Last Name",
        "body": "Enter your family or surname. This helps identify you in the system.",
        "tags": ["profile", "user"]
    },
    {
        "slug": "settings-display-name",
        "section_id": "profile",
        "title": "Display Name",
        "body": "This is the name shown to others in chats and project lists. You can use a nickname or preferred name.",
        "tags": ["profile", "user"]
    },
    {
        "slug": "settings-email",
        "section_id": "profile",
        "title": "Email",
        "body": "Your email address is used for login, notifications, and account recovery. Keep it up to date.",
        "tags": ["profile", "user"]
    },
    {
        "slug": "settings-password",
        "section_id": "security",
        "title": "Password",
        "body": "Choose a strong password to protect your account. You can change it anytime from the security settings.",
        "tags": ["security", "user"]
    },
    {
        "slug": "settings-email-notifications",
        "section_id": "notifications",
        "title": "Email Notifications",
        "body": "Enable or disable email notifications for important events, such as project updates or mentions.",
        "tags": ["notifications"]
    },
    {
        "slug": "settings-inapp-notifications",
        "section_id": "notifications",
        "title": "In-App Notifications",
        "body": "Control whether you receive notifications inside the app for new messages, alerts, and more.",
        "tags": ["notifications"]
    },
    {
        "slug": "settings-notification-sound",
        "section_id": "notifications",
        "title": "Notification Sound",
        "body": "Choose the sound played for notifications. You can select from several options or mute sounds entirely.",
        "tags": ["notifications"]
    },
    {
        "slug": "settings-default-model",
        "section_id": "ai",
        "title": "Default Model",
        "body": "Select the AI model used for chat and automation by default. This affects all new conversations unless overridden.",
        "tags": ["ai", "model"]
    },
    {
        "slug": "settings-default-temperature",
        "section_id": "ai",
        "title": "Default Temperature",
        "body": "Controls the randomness of AI responses. Lower values make output more focused; higher values make it more creative.",
        "tags": ["ai", "model"]
    },
    {
        "slug": "settings-system-prompt",
        "section_id": "ai",
        "title": "System Prompt",
        "body": "A system prompt sets the context for the AI in every conversation. Customize it to guide the assistant's behavior.",
        "tags": ["ai", "prompt"]
    },
    {
        "slug": "settings-default-num-ctx",
        "section_id": "ai",
        "title": "Default Context Window",
        "body": "Controls how much conversation history the model can use. Higher values can improve long-session continuity but consume more VRAM and may increase latency.",
        "tags": ["ai", "model", "performance"]
    },
    {
        "slug": "imagegen-prompt",
        "section_id": "image-gen",
        "title": "Prompt",
        "body": "Describe the image you want to generate. Be specific for best results. Include style, subject, and details.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-system-prompt",
        "section_id": "image-gen",
        "title": "Image System Context",
        "body": "Global image-specific instructions applied before each image prompt. Use this for persistent style, composition, or quality rules that should not affect chat behavior.",
        "tags": ["image", "generation", "context"]
    },
    {
        "slug": "imagegen-project-system-context",
        "section_id": "image-gen",
        "title": "Project Image Context",
        "body": "Project-level image instructions for this workspace. These apply to image generation only in the current project and override your user-level image context.",
        "tags": ["image", "generation", "context", "project"]
    },
    {
        "slug": "imagegen-workflow",
        "section_id": "image-gen",
        "title": "Workflow",
        "body": "Select generation mode: text-to-image for new images, image-to-image for edits, inpainting for masked edits, and face-morph for blending two faces/images.",
        "tags": ["image", "generation", "workflow"]
    },
    {
        "slug": "imagegen-negative-prompt",
        "section_id": "image-gen",
        "title": "Negative Prompt",
        "body": "List things you want to avoid in the generated image (e.g., blurry, low quality, distorted).",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-width",
        "section_id": "image-gen",
        "title": "Width",
        "body": "Set the width (in pixels) for generated images. Larger sizes may take longer to process.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-height",
        "section_id": "image-gen",
        "title": "Height",
        "body": "Set the height (in pixels) for generated images. Larger sizes may take longer to process.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-steps",
        "section_id": "image-gen",
        "title": "Steps",
        "body": "Number of steps the AI uses to generate the image. More steps can improve quality but increase time.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-cfg-scale",
        "section_id": "image-gen",
        "title": "CFG Scale",
        "body": "Classifier-Free Guidance (CFG) scale controls how closely the image matches your prompt. Higher values = more strict.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-mask-editor",
        "section_id": "image-gen",
        "title": "Inpaint Mask Editor",
        "body": "Use the mask editor to paint areas you want regenerated. White painted regions are rewritten, and black regions are preserved. Use Erase to restore preserved areas before submitting.",
        "tags": ["image", "generation", "inpainting"]
    },
    {
        "slug": "imagegen-completion-notif",
        "section_id": "image-gen",
        "title": "Completion Notification",
        "body": "Enable to receive a notification when image generation finishes.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-desktop-notif",
        "section_id": "image-gen",
        "title": "Desktop Notification",
        "body": "Enable desktop notifications for image generation events.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-auto-delete-days",
        "section_id": "image-gen",
        "title": "Auto Delete Days",
        "body": "Automatically delete generated images after a set number of days to save storage.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-max-generations",
        "section_id": "image-gen",
        "title": "Max Stored Generations",
        "body": "Limit how many generated images are retained. Leave blank for no limit, or set a value to cap retained generation history and control disk usage.",
        "tags": ["image", "generation", "storage"]
    },
    {
        "slug": "imagegen-comfyui-base-url",
        "section_id": "image-gen",
        "title": "ComfyUI Base URL",
        "body": "Override the default ComfyUI server endpoint for this user. Leave blank to use the backend default; set it when running ComfyUI on a custom host or port.",
        "tags": ["image", "generation", "integration"]
    },
    {
        "slug": "workspace-files",
        "section_id": "workspace",
        "title": "Files",
        "body": "Browse, create, edit, and organize project files. Use this to manage code, documentation, and resources.",
        "tags": ["workspace", "files"]
    },
    {
        "slug": "workspace-run",
        "section_id": "workspace",
        "title": "Run",
        "body": "Run your project or scripts. This executes the main entry point or selected file.",
        "tags": ["workspace", "run"]
    },
    {
        "slug": "workspace-actions",
        "section_id": "workspace",
        "title": "Actions",
        "body": "Access automation actions for your project, such as file operations, commands, and package installs.",
        "tags": ["workspace", "actions"]
    },
    {
        "slug": "workspace-history",
        "section_id": "workspace",
        "title": "History",
        "body": "View the history of actions, changes, and events in your workspace.",
        "tags": ["workspace", "history"]
    },
    {
        "slug": "workspace-images",
        "section_id": "workspace",
        "title": "Images",
        "body": "Manage and view generated images for your project.",
        "tags": ["workspace", "images"]
    },
    {
        "slug": "workspace-resources",
        "section_id": "workspace",
        "title": "Resources",
        "body": "Access and manage project resources, such as datasets, models, and external files.",
        "tags": ["workspace", "resources"]
    },
    {
        "slug": "workspace-events",
        "section_id": "workspace",
        "title": "Events",
        "body": "View and track events related to your project, such as runs, errors, and notifications.",
        "tags": ["workspace", "events"]
    },
    {
        "slug": "workspace-drupal",
        "section_id": "workspace",
        "title": "Drupal",
        "body": "Integrate and manage Drupal sites or content within your project.",
        "tags": ["workspace", "drupal"]
    },
    {
        "slug": "workspace-kb",
        "section_id": "workspace",
        "title": "Knowledge Base",
        "body": "Upload documents and search the knowledge base for relevant information.",
        "tags": ["workspace", "kb"]
    },
    {
        "slug": "workspace-snapshots",
        "section_id": "workspace",
        "title": "Snapshots",
        "body": "Create and manage snapshots of your project state for backup or versioning.",
        "tags": ["workspace", "snapshots"]
    },
    {
        "slug": "workspace-context",
        "section_id": "workspace",
        "title": "Context",
        "body": "Manage context layers and snippets for your project's AI workflows.",
        "tags": ["workspace", "context"]
    },
    {
        "slug": "workspace-planning",
        "section_id": "workspace",
        "title": "Planning",
        "body": "Use planning mode to break work into steps, track progress, and execute a clear implementation plan.",
        "tags": ["workspace", "planning"]
    },
    {
        "slug": "workspace-tools",
        "section_id": "workspace",
        "title": "Tools",
        "body": "Access and configure tools available in your workspace.",
        "tags": ["workspace", "tools"]
    },
    {
        "slug": "workspace-chat",
        "section_id": "workspace",
        "title": "Chat",
        "body": "Open the chat interface to interact with the AI assistant.",
        "tags": ["workspace", "chat"]
    },
    {
        "slug": "workspace-help",
        "section_id": "workspace",
        "title": "Help",
        "body": "Browse help topics and search for answers to common questions.",
        "tags": ["workspace", "help"]
    },
    {
        "slug": "workspace-close",
        "section_id": "workspace",
        "title": "Close Project",
        "body": "Close the current project and return to the project list.",
        "tags": ["workspace", "close"]
    },
    {
        "slug": "workspace-settings",
        "section_id": "workspace",
        "title": "Settings",
        "body": "Access workspace settings and preferences.",
        "tags": ["workspace", "settings"]
    },
    {
        "slug": "project-import-website-name",
        "section_id": "workspace",
        "title": "Website Import Project Name",
        "body": "Name of the new project created from a mirrored website import. Pick a descriptive name so it is easy to find later.",
        "tags": ["workspace", "projects", "import", "website"]
    },
    {
        "slug": "project-import-website-url",
        "section_id": "workspace",
        "title": "Website Import URL",
        "body": "The starting URL used to crawl and mirror site content. The importer begins from this page and follows links based on your depth and page limits.",
        "tags": ["workspace", "projects", "import", "website"]
    },
    {
        "slug": "project-import-website-depth",
        "section_id": "workspace",
        "title": "Website Crawl Depth",
        "body": "How many internal link levels to follow from the starting URL. Higher depth captures more of a site but increases time and storage.",
        "tags": ["workspace", "projects", "import", "website"]
    },
    {
        "slug": "project-import-website-max-pages",
        "section_id": "workspace",
        "title": "Website Max Pages",
        "body": "Safety limit for the number of pages to mirror during website import. Use this to prevent unexpectedly large downloads.",
        "tags": ["workspace", "projects", "import", "website", "safety"]
    },
    {
        "slug": "project-import-website-include-assets",
        "section_id": "workspace",
        "title": "Website Include Assets",
        "body": "When enabled, same-domain CSS, JavaScript, and image assets are downloaded and rewritten to local project paths.",
        "tags": ["workspace", "projects", "import", "website", "assets"]
    },
    {
        "slug": "project-import-website-same-domain",
        "section_id": "workspace",
        "title": "Website Same Domain Only",
        "body": "Limits downloads to the original domain used for import. External domains are not downloaded and remain as links.",
        "tags": ["workspace", "projects", "import", "website", "security"]
    },
    {
        "slug": "project-import-website-install-deps",
        "section_id": "workspace",
        "title": "Website Auto Install Dependencies",
        "body": "After import, automatically run dependency installation when a known framework is detected. Disable for faster import when you only need static files.",
        "tags": ["workspace", "projects", "import", "website", "dependencies"]
    },
    {
        "slug": "palette-name",
        "section_id": "workspace",
        "title": "Palette Name",
        "body": "A descriptive label for your reusable color palette so it can be found and reused across projects and workflows.",
        "tags": ["workspace", "palette", "design"]
    },
    {
        "slug": "palette-tags",
        "section_id": "workspace",
        "title": "Palette Tags",
        "body": "Comma-separated keywords used to organize and search saved palettes (for example: brand, dark, marketing, ui).",
        "tags": ["workspace", "palette", "design"]
    },
    {
        "slug": "palette-description",
        "section_id": "workspace",
        "title": "Palette Description",
        "body": "Optional notes on how and where to use the palette, including tone, accessibility context, and implementation tips.",
        "tags": ["workspace", "palette", "design"]
    },
    {
        "slug": "palette-colors",
        "section_id": "workspace",
        "title": "Palette Colors",
        "body": "Define the list of hex colors in the palette with optional semantic roles like primary, background, text, or accent.",
        "tags": ["workspace", "palette", "design"]
    },
    {
        "slug": "sidebar-settings",
        "section_id": "sidebar",
        "title": "Sidebar Settings",
        "body": "User preferences and configuration options accessible from the sidebar.",
        "tags": ["sidebar", "settings"]
    },
    {
        "slug": "sidebar-palettes",
        "section_id": "sidebar",
        "title": "Palettes",
        "body": "Open the Palette Library to create, edit, and reuse color palettes anywhere in the application.",
        "tags": ["sidebar", "palette", "navigation"]
    },
    {
        "slug": "sidebar-projects",
        "section_id": "sidebar",
        "title": "Projects",
        "body": "Manage your projects. Create, open, and organize AI workstation projects from this menu.",
        "tags": ["sidebar", "projects"]
    },
    {
        "slug": "sidebar-ide",
        "section_id": "sidebar",
        "title": "Open IDE",
        "body": "Open the workspace IDE with a code editor, terminal, file explorer, and integrated tools for your project.",
        "tags": ["sidebar", "workspace", "ide"]
    },
    {
        "slug": "sidebar-help",
        "section_id": "sidebar",
        "title": "Help",
        "body": "Browse help topics and search for answers to common questions about using the AI Workstation.",
        "tags": ["sidebar", "help"]
    },
    {
        "slug": "sidebar-logout",
        "section_id": "sidebar",
        "title": "Log Out",
        "body": "Sign out of your account. Your session will end and you will be redirected to the login page.",
        "tags": ["sidebar", "auth"]
    },
    {
        "slug": "chat-stop",
        "section_id": "chat",
        "title": "Stop Generating",
        "body": "Stop the AI from generating a response. Press Escape or click the stop button to cancel the current response.",
        "tags": ["chat", "controls"]
    },
    {
        "slug": "chat-send",
        "section_id": "chat",
        "title": "Send Message",
        "body": "Send your message to the AI assistant. Press Enter to send, or Shift+Enter for a new line.",
        "tags": ["chat", "controls"]
    },
    {
        "slug": "docker-export-image-name",
        "section_id": "projects",
        "title": "Docker Export: Image Name",
        "body": "Set the Docker image repository name used when exporting your project as a portable image.",
        "tags": ["projects", "docker", "export"]
    },
    {
        "slug": "docker-export-include-compose",
        "section_id": "projects",
        "title": "Docker Export: Include Compose File",
        "body": "Enable this option to generate a docker-compose.yml based on your exported project container configuration.",
        "tags": ["projects", "docker", "export"]
    },
    {
        "slug": "docker-export-include-tar",
        "section_id": "projects",
        "title": "Docker Export: Include TAR",
        "body": "Enable this option to create a downloadable TAR archive of the exported Docker image.",
        "tags": ["projects", "docker", "export"]
    },
    {
        "slug": "drupal-connect-site-url",
        "section_id": "drupal",
        "title": "Drupal Connect: Site URL",
        "body": "Provide the base URL of the Drupal site you want to connect. Example: https://example.com",
        "tags": ["drupal", "integration"]
    },
    {
        "slug": "drupal-connect-api-key",
        "section_id": "drupal",
        "title": "Drupal Connect: API Key",
        "body": "Enter the API key generated for the remote Drupal integration endpoint.",
        "tags": ["drupal", "integration", "security"]
    },
    {
        "slug": "drupal-connect-site-name",
        "section_id": "drupal",
        "title": "Drupal Connect: Site Name",
        "body": "Optional display name to help you identify this Drupal connection in the UI.",
        "tags": ["drupal", "integration"]
    },
    {
        "slug": "events-template",
        "section_id": "events",
        "title": "Events: Template",
        "body": "Templates prefill event type, payload, and severity for common event scenarios.",
        "tags": ["events", "workflow"]
    },
    {
        "slug": "events-type",
        "section_id": "events",
        "title": "Events: Type",
        "body": "Event type is a machine-readable identifier used by listeners and automation logic.",
        "tags": ["events", "schema"]
    },
    {
        "slug": "events-severity",
        "section_id": "events",
        "title": "Events: Severity",
        "body": "Severity indicates event importance (info, warning, error, critical) and helps with filtering.",
        "tags": ["events", "severity"]
    },
    {
        "slug": "events-source",
        "section_id": "events",
        "title": "Events: Source",
        "body": "Source identifies which service or UI component emitted the event.",
        "tags": ["events", "metadata"]
    },
    {
        "slug": "events-data",
        "section_id": "events",
        "title": "Events: Data",
        "body": "Event data is the JSON payload attached to the event. Keep it valid JSON and aligned with event type expectations.",
        "tags": ["events", "payload"]
    },
    {
        "slug": "events-persist",
        "section_id": "events",
        "title": "Events: Persist",
        "body": "Persisting an event stores it in the database in addition to broadcasting it in real time.",
        "tags": ["events", "storage"]
    }
]

async def main():
    async with AsyncSessionLocal() as session:
        manager = HelpManager(session)
        for topic in HELP_TOPICS:
            _, changed = await manager.create_or_update_topic(
                slug=topic["slug"],
                section_id=topic["section_id"],
                title=topic["title"],
                body=topic["body"],
                tags=topic["tags"],
            )
            if changed:
                print(f"Upserted help topic: {topic['slug']}")
            else:
                print(f"Help topic unchanged: {topic['slug']}")

if __name__ == "__main__":
    asyncio.run(main())
