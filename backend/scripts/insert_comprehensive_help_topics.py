
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
        "body": "Enter your given name for personalization across chat, workspace activity, and account screens. This helps teammates identify you in shared projects. Tip: use the name you want to appear in audit logs and collaboration views.",
        "tags": ["profile", "user"]
    },
    {
        "slug": "settings-last-name",
        "section_id": "profile",
        "title": "Last Name",
        "body": "Enter your surname so your profile remains clear in user lists, notifications, and admin views. It is paired with first name in account and governance workflows. Tip: keep your legal or team-recognized surname for easier support requests.",
        "tags": ["profile", "user"]
    },
    {
        "slug": "settings-display-name",
        "section_id": "profile",
        "title": "Display Name",
        "body": "Display name is what people see in chat threads, project collaboration surfaces, and activity feeds. It does not change your login identity, only presentation. Tip: pick a concise name teammates can quickly recognize.",
        "tags": ["profile", "user"]
    },
    {
        "slug": "settings-email",
        "section_id": "profile",
        "title": "Email",
        "body": "Your email is used for authentication, recovery, and outbound notifications. Several tools rely on verified email to send alerts about long-running tasks and security events. Tip: use an inbox you actively monitor so you do not miss failure notices.",
        "tags": ["profile", "user"]
    },
    {
        "slug": "settings-password",
        "section_id": "security",
        "title": "Password",
        "body": "Set a strong password to protect access to projects, API-connected tools, and admin operations. Security settings apply account-wide across chat, workspace, and integrations. Tip: use a unique passphrase with a password manager and rotate it after any credential exposure.",
        "tags": ["security", "user"]
    },
    {
        "slug": "settings-email-notifications",
        "section_id": "notifications",
        "title": "Email Notifications",
        "body": "Email notifications deliver important updates when you are away from the app, such as task completion, project changes, or important alerts. They complement in-app notifications rather than replacing them. Tip: keep high-priority emails on even if you mute lower-priority channels.",
        "tags": ["notifications"]
    },
    {
        "slug": "settings-inapp-notifications",
        "section_id": "notifications",
        "title": "In-App Notifications",
        "body": "In-app notifications surface updates while you are actively working in chat, workspace panels, and admin areas. They help you respond quickly to running jobs or tool prompts. Tip: keep in-app notifications enabled for real-time workflows and approvals.",
        "tags": ["notifications"]
    },
    {
        "slug": "settings-notification-sound",
        "section_id": "notifications",
        "title": "Notification Sound",
        "body": "Notification sound gives an audible cue for important events such as completed generations or pending actions. It works with in-app and desktop notifications where supported. Tip: choose a subtle sound for daily use and rely on visual badges for low-priority events.",
        "tags": ["notifications"]
    },
    {
        "slug": "settings-default-model",
        "section_id": "ai",
        "title": "Default Model",
        "body": "Default model controls which model starts new conversations and many assistant-driven actions. It is the baseline for chat quality, speed, and tool behavior before per-chat overrides. Tip: pick a reliable general model first, then switch to specialized models for targeted tasks.",
        "tags": ["ai", "model"]
    },
    {
        "slug": "settings-default-temperature",
        "section_id": "ai",
        "title": "Default Temperature",
        "body": "Temperature sets response creativity for chat and assistant drafting. Lower values produce stable, deterministic outputs; higher values increase variation and brainstorming behavior. Tip: use lower temperature for code and ops tasks, and moderate values for ideation.",
        "tags": ["ai", "model"]
    },
    {
        "slug": "settings-system-prompt",
        "section_id": "ai",
        "title": "System Prompt",
        "body": "System prompt defines default assistant behavior across new chats, including tone, constraints, and priorities. It works with project context and tool outputs to shape final responses. Tip: keep instructions specific, test with a few prompts, and revise based on observed behavior.",
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
        "body": "Prompt describes subject, composition, and style for generation. It works together with model, sampler, CFG, and optional reference tools to produce the final image. Tip: structure prompts from broad scene to fine details for more controllable iterations.",
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
        "body": "Negative prompt tells the model what to avoid, such as artifacts, distortions, or unwanted styles. It complements your main prompt and can significantly improve consistency. Tip: keep a reusable baseline negative prompt and add issue-specific terms only when needed.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-width",
        "section_id": "image-gen",
        "title": "Width",
        "body": "Width sets horizontal resolution and affects composition, detail, runtime, and memory use. It should be chosen together with height, model family, and intended output channel. Tip: start with moderate dimensions for iteration, then upscale or rerender at final size.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-height",
        "section_id": "image-gen",
        "title": "Height",
        "body": "Height sets vertical resolution and, with width, determines aspect ratio and resource cost. It influences framing and can change model behavior on some checkpoints. Tip: match target platform ratios early so fewer revisions are needed later.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-steps",
        "section_id": "image-gen",
        "title": "Steps",
        "body": "Steps control denoising iteration count during sampling. More steps can improve detail and stability but increase runtime and GPU usage. Tip: tune steps with your chosen sampler because optimal values vary by model and workflow.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-cfg-scale",
        "section_id": "image-gen",
        "title": "CFG Scale",
        "body": "CFG scale controls how strongly generation follows your prompt versus model priors. Low values allow freer interpretation, while very high values can overconstrain outputs. Tip: adjust CFG after prompt quality and model choice are stable to avoid chasing multiple variables.",
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
        "body": "Completion notifications alert you when jobs finish so you can continue other tasks without constant polling. This is useful for long batches or heavier workflows. Tip: pair this with desktop notifications if you work across multiple windows.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-desktop-notif",
        "section_id": "image-gen",
        "title": "Desktop Notification",
        "body": "Desktop notifications send operating-system level alerts for generation events, even when the tab is not focused. They complement in-app status and toasts. Tip: grant browser notification permission once, then tune which event types you actually need.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-auto-delete-days",
        "section_id": "image-gen",
        "title": "Auto Delete Days",
        "body": "Auto delete removes older generated outputs after the selected retention period to control storage growth. It is especially useful for high-volume experimentation. Tip: export or pin key images before cleanup windows if you want to keep them long term.",
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
        "slug": "imagegen-model",
        "section_id": "image-gen",
        "title": "Model (Checkpoint)",
        "body": "Select the Stable Diffusion checkpoint model to use for generation. Different models produce different styles — for example, realistic photo models, anime/illustration models, or general-purpose models. The model must be installed in ComfyUI's checkpoints directory.",
        "tags": ["image", "generation", "model"]
    },
    {
        "slug": "imagegen-sampler",
        "section_id": "image-gen",
        "title": "Sampler",
        "body": "The sampling algorithm used during image generation. Common choices:\n\n- **euler** — Fast, good quality. A solid default.\n- **euler_ancestral** — Adds randomness for more creative/varied outputs.\n- **dpmpp_2m** — High quality, slightly slower. Great for detailed images.\n- **dpmpp_sde** — Stochastic variant with fine detail.\n- **ddim** — Deterministic, good for reproducibility.\n- **uni_pc** — Fast convergence, fewer steps needed.\n\nIf unsure, start with **euler** or **dpmpp_2m**.",
        "tags": ["image", "generation", "sampler"]
    },
    {
        "slug": "imagegen-scheduler",
        "section_id": "image-gen",
        "title": "Scheduler",
        "body": "Controls the noise schedule — how noise is added and removed across generation steps.\n\n- **normal** — Standard linear schedule. The safe default.\n- **karras** — Recommended for most use cases. Produces sharper, cleaner images by concentrating denoising in later steps.\n- **exponential** — Aggressive noise removal; can produce crisp results with fewer steps.\n- **sgm_uniform** — Uniform spacing, used by some SDXL-optimized workflows.\n\nPair **karras** with **dpmpp_2m** for a reliable high-quality combo.",
        "tags": ["image", "generation", "scheduler"]
    },
    {
        "slug": "imagegen-batch-size",
        "section_id": "image-gen",
        "title": "Batch Size",
        "body": "Generate multiple images at once from the same prompt and settings. Each image uses a different random seed. Useful for exploring variations — set batch size to 4 to quickly compare results. Higher batch sizes use more VRAM and take longer.",
        "tags": ["image", "generation", "batch"]
    },
    {
        "slug": "imagegen-seed",
        "section_id": "image-gen",
        "title": "Seed",
        "body": "A number that controls the random starting point for generation. The same seed with the same settings produces the same image — useful for reproducibility. Leave empty for a random seed each time. After generating, check the seed in the image details to recreate or tweak a result you liked.",
        "tags": ["image", "generation", "seed"]
    },
    {
        "slug": "imagegen-denoise",
        "section_id": "image-gen",
        "title": "Denoise Strength",
        "body": "Controls how much the input image is changed during image-to-image or inpainting workflows.\n\n- **0.0** — No change (output matches input exactly).\n- **0.3–0.5** — Subtle edits, preserves most of the original.\n- **0.6–0.8** — Moderate transformation. Good balance for most edits.\n- **1.0** — Complete regeneration, ignores the input image structure.\n\nFor inpainting, use 0.5–0.8 to blend the regenerated area naturally with the surrounding image.",
        "tags": ["image", "generation", "img2img", "inpainting"]
    },
    {
        "slug": "imagegen-morph-strength",
        "section_id": "image-gen",
        "title": "Morph Strength",
        "body": "Controls the blending intensity between the input face/image and the target face/image in face-morph mode.\n\n- **0.0** — Output looks like the input (no morphing).\n- **0.5** — 50/50 blend between input and target.\n- **1.0** — Output looks like the target.\n\nAdjust to find the right balance between the two faces or images.",
        "tags": ["image", "generation", "face-morph"]
    },
    {
        "slug": "imagegen-lora",
        "section_id": "image-gen",
        "title": "LoRA Stack",
        "body": "LoRAs (Low-Rank Adaptations) are small add-on models that modify the checkpoint's behavior for specific styles, subjects, or concepts. You can stack multiple LoRAs.\n\nEach LoRA has two strength values:\n- **Model Strength** — How strongly the LoRA affects the image content.\n- **CLIP Strength** — How strongly the LoRA affects prompt interpretation.\n\nTypical range is 0.5–1.0 for both. Start at 0.7 and adjust. LoRA files must be installed in ComfyUI's loras directory.",
        "tags": ["image", "generation", "lora"]
    },
    {
        "slug": "imagegen-reference-image",
        "section_id": "image-gen",
        "title": "Reference Image (Style Transfer)",
        "body": "Upload a reference image for IPAdapter-based style transfer. The output adopts the visual style, color palette, and composition of the reference while still following your text prompt.\n\n- **Style Weight** — How strongly the reference style influences the output (0–150%). At 0%, the reference is ignored; at 100%+, it dominates.\n- **Variation/Noise** — Adds randomness to break away from exact style copying. 0% = faithful reproduction, higher = more creative interpretation.\n\nWorks best with clear, high-quality reference images.",
        "tags": ["image", "generation", "style-transfer", "ipadapter"]
    },
    {
        "slug": "imagegen-controlnet",
        "section_id": "image-gen",
        "title": "ControlNet (Structure Guide)",
        "body": "ControlNet constrains the generated image to follow the structure of a guide image. Types:\n\n- **canny** — Edge detection. Best for preserving outlines and shapes.\n- **depth** — Depth map. Maintains spatial relationships and perspective.\n- **openpose** — Human pose skeleton. Controls body position and posture.\n- **lineart** — Clean line art extraction. Great for coloring/stylizing sketches.\n- **scribble** — Rough sketch interpretation. Turn doodles into detailed images.\n- **softedge** — Soft edge detection. More forgiving than canny.\n\n**Strength** (0–2) controls how closely the output follows the guide. Start at 0.8–1.0.",
        "tags": ["image", "generation", "controlnet"]
    },
    {
        "slug": "workspace-files",
        "section_id": "workspace",
        "title": "Files",
        "body": "Files is the source-of-truth panel for code, prompts, assets, and configuration in a project. Changes here feed directly into Run, Tools, Planning, and AI chat context when file-based workflows are active. Tip: keep a clear folder structure so automation and teammates can find inputs quickly.",
        "tags": ["workspace", "files"]
    },
    {
        "slug": "workspace-run",
        "section_id": "workspace",
        "title": "Run",
        "body": "Run executes project commands inside the active workspace environment and is commonly used after edits in Files or Actions. Results and logs can drive follow-up work in Chat, Events, and History. Tip: validate small commands first before launching longer workflows.",
        "tags": ["workspace", "run"]
    },
    {
        "slug": "workspace-actions",
        "section_id": "workspace",
        "title": "Actions",
        "body": "Actions provide reusable automation for file operations, command execution, installs, and workflow shortcuts. They are the glue between manual editing and repeatable project operations. Tip: use Actions for repeat tasks so results stay consistent across runs.",
        "tags": ["workspace", "actions"]
    },
    {
        "slug": "workspace-history",
        "section_id": "workspace",
        "title": "History",
        "body": "History shows a timeline of changes, runs, and system activity for troubleshooting and auditability. It helps connect what happened in Actions, Run, and Tools to final outcomes. Tip: check History first when behavior changes unexpectedly.",
        "tags": ["workspace", "history"]
    },
    {
        "slug": "workspace-images",
        "section_id": "workspace",
        "title": "Images",
        "body": "Images centralizes generated outputs, metadata, and iteration history from image workflows. It ties together Prompt, Settings, model choices, and optional controls like LoRA or ControlNet. Tip: review seed and workflow metadata when recreating a result.",
        "tags": ["workspace", "images"]
    },
    {
        "slug": "workspace-resources",
        "section_id": "workspace",
        "title": "Resources",
        "body": "Resources manages reusable project inputs such as datasets, files, and model assets used across panels. It supports stable references for tools and long-running workflows. Tip: store canonical assets here instead of ad-hoc locations to avoid path drift.",
        "tags": ["workspace", "resources"]
    },
    {
        "slug": "workspace-events",
        "section_id": "workspace",
        "title": "Events",
        "body": "Events provides real-time and persisted signaling for important workflow state changes, failures, and custom automation hooks. It connects Run, Actions, and external listeners through a common event model. Tip: standardize event types early so filtering and automation stay clean.",
        "tags": ["workspace", "events"]
    },
    {
        "slug": "workspace-drupal",
        "section_id": "workspace",
        "title": "Drupal",
        "body": "Drupal connects your project to remote Drupal environments for content operations, staging, and preview-driven workflows. It works alongside Chat and tools so generated edits can be validated in context. Tip: use staging first for risky changes before any production push.",
        "tags": ["workspace", "drupal"]
    },
    {
        "slug": "workspace-kb",
        "section_id": "workspace",
        "title": "Knowledge Base",
        "body": "Knowledge Base stores indexed documents for retrieval-augmented answers in chat and tools. It integrates with extraction, chunking, and embedding settings from the KB builder pipeline. Tip: curate source documents before indexing to improve retrieval quality.",
        "tags": ["workspace", "kb"]
    },
    {
        "slug": "workspace-snapshots",
        "section_id": "workspace",
        "title": "Snapshots",
        "body": "Snapshots capture project state so you can roll back experiments, compare iterations, and recover safely. They complement source control by preserving workspace runtime context. Tip: create snapshots before large refactors or dependency upgrades.",
        "tags": ["workspace", "snapshots"]
    },
    {
        "slug": "workspace-context",
        "section_id": "workspace",
        "title": "Context",
        "body": "Context controls what background information the assistant sees, including snippets, instructions, and project references. It directly influences chat quality, planning relevance, and tool suggestion accuracy. Tip: keep context high-signal and remove stale instructions regularly.",
        "tags": ["workspace", "context"]
    },
    {
        "slug": "workspace-planning",
        "section_id": "workspace",
        "title": "Planning",
        "body": "Planning mode breaks complex work into sequenced steps with explicit progress tracking and checkpoints. It helps coordinate Files, Run, and Tools under a single implementation strategy. Tip: keep plans outcome-focused and update steps as reality changes.",
        "tags": ["workspace", "planning"]
    },
    {
        "slug": "workspace-tools",
        "section_id": "workspace",
        "title": "Tools",
        "body": "Tools exposes callable capabilities such as shell commands, API actions, and project-specific operations used by the assistant. It is the execution layer that turns chat intent into concrete work. Tip: review tool parameters carefully and start with safe defaults.",
        "tags": ["workspace", "tools"]
    },
    {
        "slug": "workspace-ui-builder",
        "section_id": "workspace",
        "title": "UI Builder",
        "body": "UI Builder helps prototype interface direction quickly by combining prompt-driven generation with visual iteration. It fits best with design tasks where chat guidance and preview feedback are both needed. Tip: iterate in short cycles and capture reusable patterns in project docs.",
        "tags": ["workspace", "ui-builder", "design"]
    },
    {
        "slug": "workspace-chat",
        "section_id": "workspace",
        "title": "Chat",
        "body": "Chat is the orchestration surface for reasoning, planning, and tool-assisted execution in a project. It pulls from context, files, KB results, and tool outputs to deliver grounded responses. Tip: provide concrete goals and constraints up front for higher-quality execution.",
        "tags": ["workspace", "chat"]
    },
    {
        "slug": "workspace-help",
        "section_id": "workspace",
        "title": "Help",
        "body": "Help provides searchable documentation for fields, workflows, and panel interactions across the app. It is designed for in-context learning while you work. Tip: use section filters and targeted searches before escalating to support.",
        "tags": ["workspace", "help"]
    },
    {
        "slug": "workspace-close",
        "section_id": "workspace",
        "title": "Close Project",
        "body": "Close Project exits the active workspace and returns you to project selection without deleting project data. Use it when switching focus to another project or environment. Tip: save unsaved edits and capture a snapshot before closing major sessions.",
        "tags": ["workspace", "close"]
    },
    {
        "slug": "workspace-settings",
        "section_id": "workspace",
        "title": "Settings",
        "body": "Workspace settings control project-level behavior, defaults, and integrations used across panels. They influence how chat, tools, image workflows, and resources behave in that project. Tip: align settings with team conventions early to reduce drift.",
        "tags": ["workspace", "settings"]
    },
    {
        "slug": "project-import-website-name",
        "section_id": "workspace",
        "title": "Website Import Project Name",
        "body": "This name identifies the new project created from a website mirror import. It appears in project lists, workspace headers, and collaboration surfaces. Tip: include source domain and purpose in the name so imported projects are immediately recognizable.",
        "tags": ["workspace", "projects", "import", "website"]
    },
    {
        "slug": "project-import-website-url",
        "section_id": "workspace",
        "title": "Website Import URL",
        "body": "The import URL is the crawl starting point for mirrored content. Depth, page limits, and domain options determine how much of the site is pulled into your project. Tip: begin with a representative page and conservative limits before broad crawls.",
        "tags": ["workspace", "projects", "import", "website"]
    },
    {
        "slug": "project-import-website-depth",
        "section_id": "workspace",
        "title": "Website Crawl Depth",
        "body": "Crawl depth sets how many link hops the importer follows from the starting URL. Higher depth increases coverage but also runtime, storage, and cleanup complexity. Tip: start shallow, inspect output quality, then increase depth only if needed.",
        "tags": ["workspace", "projects", "import", "website"]
    },
    {
        "slug": "project-import-website-max-pages",
        "section_id": "workspace",
        "title": "Website Max Pages",
        "body": "Max pages is a safety cap that limits how many pages are mirrored during import. It protects against unexpectedly large sites and runaway crawls. Tip: set strict limits for first-pass imports, then raise gradually after reviewing results.",
        "tags": ["workspace", "projects", "import", "website", "safety"]
    },
    {
        "slug": "project-import-website-include-assets",
        "section_id": "workspace",
        "title": "Website Include Assets",
        "body": "Include assets downloads same-domain CSS, JS, and images so imported pages render more faithfully offline in your project. This improves local preview but increases import size. Tip: disable for content-only analysis and enable when layout fidelity matters.",
        "tags": ["workspace", "projects", "import", "website", "assets"]
    },
    {
        "slug": "project-import-website-same-domain",
        "section_id": "workspace",
        "title": "Website Same Domain Only",
        "body": "Same-domain mode restricts crawling to the origin domain and avoids pulling third-party hosts. This improves security and keeps imports focused. Tip: keep this enabled unless you intentionally need cross-domain content.",
        "tags": ["workspace", "projects", "import", "website", "security"]
    },
    {
        "slug": "project-import-website-install-deps",
        "section_id": "workspace",
        "title": "Website Auto Install Dependencies",
        "body": "Auto-install dependencies runs package setup when known frameworks are detected after import. It helps move from mirrored source to runnable project faster. Tip: disable in constrained environments or when you only need static analysis artifacts.",
        "tags": ["workspace", "projects", "import", "website", "dependencies"]
    },
    {
        "slug": "palette-name",
        "section_id": "workspace",
        "title": "Palette Name",
        "body": "Palette name is the primary identifier used in search, reuse, and team handoff. Good names make design assets easier to discover across projects. Tip: encode intent in the name, such as brand, campaign, or accessibility target.",
        "tags": ["workspace", "palette", "design"]
    },
    {
        "slug": "palette-tags",
        "section_id": "workspace",
        "title": "Palette Tags",
        "body": "Palette tags support filtering, grouping, and fast retrieval in shared libraries. They connect design assets to workflows like UI Builder and image generation prompts. Tip: keep tags consistent across teams to improve search quality.",
        "tags": ["workspace", "palette", "design"]
    },
    {
        "slug": "palette-description",
        "section_id": "workspace",
        "title": "Palette Description",
        "body": "Description documents intended usage, visual tone, and constraints for a palette. It helps designers and developers apply colors consistently across UI and creative outputs. Tip: include accessibility notes and preferred component mappings.",
        "tags": ["workspace", "palette", "design"]
    },
    {
        "slug": "palette-colors",
        "section_id": "workspace",
        "title": "Palette Colors",
        "body": "Palette colors define the actual hex values and optional semantic roles like primary, surface, text, and accent. These roles make downstream use in UI and generation workflows much easier. Tip: always verify contrast for text and interactive states.",
        "tags": ["workspace", "palette", "design"]
    },
    {
        "slug": "sidebar-settings",
        "section_id": "sidebar",
        "title": "Sidebar Settings",
        "body": "Sidebar Settings is the quick entry point to account, AI, notification, and feature preferences. Changes here affect behavior across chat, workspace, and integrations. Tip: review settings after major upgrades to catch new defaults.",
        "tags": ["sidebar", "settings"]
    },
    {
        "slug": "sidebar-palettes",
        "section_id": "sidebar",
        "title": "Palettes",
        "body": "Palettes opens your shared color library for creation, editing, and reuse across design-related workflows. It connects naturally with UI Builder and visual generation tasks. Tip: standardize naming and tags so teams can reuse palettes without guesswork.",
        "tags": ["sidebar", "palette", "navigation"]
    },
    {
        "slug": "sidebar-projects",
        "section_id": "sidebar",
        "title": "Projects",
        "body": "Projects is the navigation hub for creating, opening, and organizing all workspaces. Most app functionality is project-scoped, including files, tools, and context. Tip: keep projects focused by objective so history and assets remain clean.",
        "tags": ["sidebar", "projects"]
    },
    {
        "slug": "sidebar-ide",
        "section_id": "sidebar",
        "title": "Open IDE",
        "body": "Open IDE jumps into the full workspace where editing, running, planning, and tool execution happen together. It is the primary surface for implementation work. Tip: use IDE mode for multi-step tasks that require both code and assistant orchestration.",
        "tags": ["sidebar", "workspace", "ide"]
    },
    {
        "slug": "sidebar-help",
        "section_id": "sidebar",
        "title": "Help",
        "body": "Help opens searchable documentation for features, field guidance, and workflow concepts across the application. It is designed to answer operational questions in place. Tip: search by feature name first, then refine with section-specific keywords.",
        "tags": ["sidebar", "help"]
    },
    {
        "slug": "sidebar-logout",
        "section_id": "sidebar",
        "title": "Log Out",
        "body": "Log Out ends the current authenticated session and returns you to the login screen. This is important on shared devices and high-sensitivity environments. Tip: log out explicitly after admin or production-integrated sessions.",
        "tags": ["sidebar", "auth"]
    },
    {
        "slug": "chat-stop",
        "section_id": "chat",
        "title": "Stop Generating",
        "body": "Stop Generating cancels an active model stream and returns control immediately. Use it when output is off-target, too verbose, or no longer needed. Tip: stop early and refine your prompt with clearer constraints for the next attempt.",
        "tags": ["chat", "controls"]
    },
    {
        "slug": "chat-send",
        "section_id": "chat",
        "title": "Send Message",
        "body": "Send Message submits your prompt to the assistant, including current context and selected mode settings. This is the entry point for planning, coding, and tool-assisted workflows. Tip: include goal, constraints, and expected output format in the same message.",
        "tags": ["chat", "controls"]
    },
    {
        "slug": "docker-export-image-name",
        "section_id": "projects",
        "title": "Docker Export: Image Name",
        "body": "Image name defines the repository/tag base for exported project containers. It is used downstream in registries, deployment pipelines, and team handoffs. Tip: follow a consistent naming convention with org, project, and environment segments.",
        "tags": ["projects", "docker", "export"]
    },
    {
        "slug": "docker-export-include-compose",
        "section_id": "projects",
        "title": "Docker Export: Include Compose File",
        "body": "Include Compose adds a docker-compose configuration so the exported image can be run with dependencies and ports in one command. It is useful for local replay and team onboarding. Tip: include compose when services need coordinated startup.",
        "tags": ["projects", "docker", "export"]
    },
    {
        "slug": "docker-export-include-tar",
        "section_id": "projects",
        "title": "Docker Export: Include TAR",
        "body": "Include TAR creates an offline image archive that can be transferred and loaded without direct registry access. This is helpful for air-gapped or controlled deployment paths. Tip: use TAR exports for compliance workflows that require artifact retention.",
        "tags": ["projects", "docker", "export"]
    },
    {
        "slug": "drupal-connect-site-url",
        "section_id": "drupal",
        "title": "Drupal Connect: Site URL",
        "body": "Site URL is the root address for your Drupal instance and is used to build JSON:API and staging operations. Connection tests validate this endpoint before saving credentials. Tip: use the canonical public URL that reflects production routing behavior.",
        "tags": ["drupal", "integration"]
    },
    {
        "slug": "drupal-connect-api-key",
        "section_id": "drupal",
        "title": "Drupal Connect: API Key",
        "body": "API key support is retained for older Drupal integration flows where token-based auth is used. Newer connections typically rely on username/password Basic Auth through JSON:API. Tip: use this only when your deployment is configured for key-based access.",
        "tags": ["drupal", "integration", "security"]
    },
    {
        "slug": "drupal-connect-site-name",
        "section_id": "drupal",
        "title": "Drupal Connect: Site Name",
        "body": "Site name is a friendly label shown in workspace controls, status views, and multi-site contexts. It improves clarity when switching between staging and production targets. Tip: include environment suffixes like Prod or Stage in the label.",
        "tags": ["drupal", "integration"]
    },
    {
        "slug": "events-template",
        "section_id": "events",
        "title": "Events: Template",
        "body": "Event templates provide preconfigured structures for common workflows so events stay consistent and valid. They reduce manual errors when creating operational signals. Tip: start with templates, then customize payload fields only where necessary.",
        "tags": ["events", "workflow"]
    },
    {
        "slug": "events-type",
        "section_id": "events",
        "title": "Events: Type",
        "body": "Event type is the canonical machine-readable key used by filters, automations, and downstream listeners. Stable naming is critical for reliable event-driven behavior. Tip: adopt a namespaced convention like domain.action for long-term maintainability.",
        "tags": ["events", "schema"]
    },
    {
        "slug": "events-severity",
        "section_id": "events",
        "title": "Events: Severity",
        "body": "Severity classifies event urgency to support filtering, alert routing, and triage workflows. It helps teams distinguish informational events from action-required failures. Tip: reserve critical for incidents that need immediate response.",
        "tags": ["events", "severity"]
    },
    {
        "slug": "events-source",
        "section_id": "events",
        "title": "Events: Source",
        "body": "Source identifies the originating service, tool, or UI component for an event. It improves traceability when correlating events with logs and actions. Tip: use stable source labels so dashboards and filters remain useful over time.",
        "tags": ["events", "metadata"]
    },
    {
        "slug": "events-data",
        "section_id": "events",
        "title": "Events: Data",
        "body": "Event data is the structured JSON payload that carries details for automation and diagnostics. Payload shape should match event type contracts used by consumers. Tip: include only actionable fields and avoid large unbounded payload blobs.",
        "tags": ["events", "payload"]
    },
    {
        "slug": "events-persist",
        "section_id": "events",
        "title": "Events: Persist",
        "body": "Persist stores events in the database in addition to real-time broadcast, enabling audit, replay, and historical analysis. Use persistence for important business or operational signals. Tip: persist events that matter for compliance, debugging, or reporting.",
        "tags": ["events", "storage"]
    },
    {
        "slug": "app-overview",
        "section_id": "app-guides",
        "title": "Platform Overview",
        "body": "The platform is organized around projects, where chat, workspace tools, files, and integrations share the same context. Most features are strongest when used together: chat plans and reasons, tools execute, files store outcomes, and history/events document what happened. Tip: start every session by confirming the active project and target environment.",
        "tags": ["guide", "overview", "workflow"]
    },
    {
        "slug": "app-chat-overview",
        "section_id": "app-guides",
        "title": "Chat Workflow Overview",
        "body": "Chat is your orchestration layer for ideation, planning, implementation guidance, and tool-assisted execution. It works best when combined with context panels, tool approvals, and file updates in workspace. Tip: phrase requests with objective, constraints, and expected output format to reduce back-and-forth.",
        "tags": ["guide", "chat", "workflow"]
    },
    {
        "slug": "app-workspace-overview",
        "section_id": "app-guides",
        "title": "Workspace Overview",
        "body": "Workspace combines files, run controls, tools, planning, and panel-specific capabilities in one operational surface. It is where assistant guidance turns into concrete project changes and verifiable outputs. Tip: move between Chat and Workspace frequently to keep reasoning and execution aligned.",
        "tags": ["guide", "workspace", "workflow"]
    },
    {
        "slug": "app-mcp-overview",
        "section_id": "app-guides",
        "title": "MCP Workspace Overview",
        "body": "MCP workspace pairs chat with live external capability layers so actions can be executed through structured tools and reflected in connected previews. In Drupal-style flows, this means conversation-driven updates with near real-time validation in preview panes. Tip: keep staging or sandbox targets active while testing MCP-driven changes.",
        "tags": ["guide", "mcp", "integration"]
    },
    {
        "slug": "app-drupal-overview",
        "section_id": "app-guides",
        "title": "Drupal Integration Overview",
        "body": "Drupal integration supports connection management, content operations, staging clone/push, and preview validation from one interface. It fits into the broader workflow by combining chat guidance, tool actions, and environment controls. Tip: validate credentials and staging status before large synchronization tasks.",
        "tags": ["guide", "drupal", "integration"]
    },
    {
        "slug": "app-studio-overview",
        "section_id": "app-guides",
        "title": "Studio Overview",
        "body": "Studio focuses on creative production workflows such as timeline-based work, media settings, and output export paths. It integrates with project resources and backend rendering services for reproducible results. Tip: lock core project settings before long renders to avoid mismatched outputs.",
        "tags": ["guide", "studio", "media"]
    },
    {
        "slug": "app-settings-overview",
        "section_id": "app-guides",
        "title": "Settings Overview",
        "body": "Settings controls account, AI defaults, notifications, and feature-specific preferences that shape behavior across the entire app. Good defaults reduce friction in every new chat and project workflow. Tip: revisit settings after changing model providers or adding new integrations.",
        "tags": ["guide", "settings", "configuration"]
    },
    {
        "slug": "app-projects-overview",
        "section_id": "app-guides",
        "title": "Projects and Imports Overview",
        "body": "Projects define boundaries for files, context, tools, and integrations. Import and export features let you bootstrap work from websites and package outcomes for deployment. Tip: keep one clear objective per project to simplify retrieval, governance, and collaboration.",
        "tags": ["guide", "projects", "import", "export"]
    },
    {
        "slug": "app-admin-overview",
        "section_id": "app-guides",
        "title": "Admin Console Overview",
        "body": "Admin tools manage users, service health, help topics, and system-level configuration. Changes here can affect all users and workflows, so they should be deliberate and documented. Tip: test policy and configuration changes in non-production environments first.",
        "tags": ["guide", "admin", "operations"]
    },
    {
        "slug": "app-imagegen-overview",
        "section_id": "app-guides",
        "title": "Image Generation Workflow Overview",
        "body": "Image generation combines prompt engineering, model selection, sampling settings, and optional controls like LoRA, ControlNet, and reference images. Outputs feed into project assets and can be reused in downstream design or media workflows. Tip: tune one variable at a time for reliable comparisons.",
        "tags": ["guide", "image", "workflow"]
    },
    {
        "slug": "app-kb-overview",
        "section_id": "app-guides",
        "title": "Knowledge Base Workflow Overview",
        "body": "Knowledge base workflows transform documents through extraction, chunking, embedding, and indexing so chat and tools can retrieve relevant context quickly. Quality depends on clean source data and coherent indexing settings. Tip: run a pilot index and query test before bulk ingestion.",
        "tags": ["guide", "kb", "retrieval"]
    },
    {
        "slug": "app-tools-overview",
        "section_id": "app-guides",
        "title": "Tools Integration Overview",
        "body": "Tools are execution primitives that let the assistant perform concrete operations such as command execution, API calls, and workflow actions. They connect reasoning in chat to real system changes in workspace. Tip: require explicit approvals for sensitive tools and track outcomes in history/events.",
        "tags": ["guide", "tools", "integration"]
    },
    {
        "slug": "field-help-overview",
        "section_id": "help",
        "title": "Using Field Help",
        "body": "Each help icon gives you a quick tip for the field you are editing. Select Read more to open full guidance in the Help panel. Tip: if you are unsure what to enter, start with the recommended default and refine after your first run.",
        "tags": ["help", "fields", "basics"]
    },
    {
        "slug": "tool-parameter-text",
        "section_id": "workspace",
        "title": "Tool Parameter: Text Input",
        "body": "Text parameters pass plain string values to tools. Enter short, specific values so the tool can interpret your intent clearly. Tip: avoid trailing punctuation or extra spaces unless they are meaningful to the command.",
        "tags": ["workspace", "tools", "parameters"]
    },
    {
        "slug": "tool-parameter-number",
        "section_id": "workspace",
        "title": "Tool Parameter: Number Input",
        "body": "Number parameters expect numeric values such as limits, sizes, or thresholds. Use whole numbers unless the field explicitly supports decimals. Tip: start conservative (for example, smaller limits) and increase only if needed.",
        "tags": ["workspace", "tools", "parameters"]
    },
    {
        "slug": "tool-parameter-select",
        "section_id": "workspace",
        "title": "Tool Parameter: Select Option",
        "body": "Select parameters provide safe predefined choices. Pick the option that best matches your task rather than typing a custom value. Tip: when in doubt, use the default option first and compare results.",
        "tags": ["workspace", "tools", "parameters"]
    },
    {
        "slug": "tool-parameter-boolean",
        "section_id": "workspace",
        "title": "Tool Parameter: Toggle",
        "body": "Boolean parameters are on or off switches. Enable a toggle only when you need that behavior because it can materially change tool output. Tip: review the tool description before turning on advanced toggles.",
        "tags": ["workspace", "tools", "parameters"]
    },
    {
        "slug": "drupal-connect-username",
        "section_id": "drupal",
        "title": "Drupal Connect: Username",
        "body": "Use a Drupal account name that has JSON:API access for the content you want to manage. Tip: create a dedicated integration user with only the permissions this workspace needs.",
        "tags": ["drupal", "integration", "security"]
    },
    {
        "slug": "drupal-connect-password",
        "section_id": "drupal",
        "title": "Drupal Connect: Password",
        "body": "Enter the password for the Drupal integration user. Credentials are encrypted before storage by the backend service. Tip: rotate this password regularly and update it here immediately after rotation.",
        "tags": ["drupal", "integration", "security"]
    },
    {
        "slug": "imagegen-controlnet-type",
        "section_id": "image-gen",
        "title": "ControlNet Type",
        "body": "ControlNet type chooses how the guide image is interpreted, such as edges, depth, pose, or line art. Tip: use canny for clear outlines, depth for scene layout, and openpose for people.",
        "tags": ["image", "generation", "controlnet"]
    },
    {
        "slug": "imagegen-controlnet-strength",
        "section_id": "image-gen",
        "title": "ControlNet Strength",
        "body": "ControlNet strength sets how tightly the generated image follows your guide image. Lower values allow more creativity; higher values preserve structure. Tip: start around 0.8 to 1.0 and adjust in small steps.",
        "tags": ["image", "generation", "controlnet"]
    },
    {
        "slug": "imagegen-reference-weight",
        "section_id": "image-gen",
        "title": "Reference Weight",
        "body": "Reference weight controls how strongly the reference image style influences the output. Tip: begin near 50 to 70 percent for a balanced blend, then raise it if style transfer is too subtle.",
        "tags": ["image", "generation", "style-transfer"]
    },
    {
        "slug": "imagegen-reference-noise",
        "section_id": "image-gen",
        "title": "Reference Noise",
        "body": "Reference noise adds variation so results are less rigidly tied to the source image. Tip: keep noise low for faithful style transfer and increase it when you want more creative diversity.",
        "tags": ["image", "generation", "style-transfer"]
    },
    {
        "slug": "kb-file-types",
        "section_id": "kb-builder",
        "title": "KB Builder: Supported File Types",
        "body": "The KB builder can process common documents such as PDF, text, markdown, and office formats depending on your extraction settings. Tip: prefer clean text-rich files to reduce extraction errors.",
        "tags": ["kb", "kb-builder", "documents"]
    },
    {
        "slug": "kb-text-extraction",
        "section_id": "kb-builder",
        "title": "KB Builder: Text Extraction",
        "body": "Text extraction converts uploaded files into machine-readable content before chunking and embedding. Tip: verify extracted text samples before indexing large batches.",
        "tags": ["kb", "kb-builder", "extraction"]
    },
    {
        "slug": "kb-ocr-explained",
        "section_id": "kb-builder",
        "title": "KB Builder: OCR",
        "body": "OCR reads text from images or scanned documents. Use OCR when files are image-based and standard extraction returns little or no text. Tip: higher-resolution scans generally produce better OCR quality.",
        "tags": ["kb", "kb-builder", "ocr"]
    },
    {
        "slug": "kb-vision-models",
        "section_id": "kb-builder",
        "title": "KB Builder: Vision Models",
        "body": "Vision models are used when extraction needs image understanding beyond plain OCR. Tip: choose lighter models for speed and heavier models only when document complexity requires it.",
        "tags": ["kb", "kb-builder", "vision"]
    },
    {
        "slug": "kb-chunking-overview",
        "section_id": "kb-builder",
        "title": "KB Builder: Chunking Overview",
        "body": "Chunking splits extracted text into smaller pieces for better retrieval quality and context fit. Tip: choose a preset first, then tune chunk size and overlap only if search quality needs improvement.",
        "tags": ["kb", "kb-builder", "chunking"]
    },
    {
        "slug": "kb-chunk-size",
        "section_id": "kb-builder",
        "title": "KB Builder: Chunk Size",
        "body": "Chunk size sets the target number of tokens per chunk. Larger chunks keep more context; smaller chunks improve precision. Tip: use medium chunk sizes for most general-purpose knowledge bases.",
        "tags": ["kb", "kb-builder", "chunking"]
    },
    {
        "slug": "kb-chunk-overlap",
        "section_id": "kb-builder",
        "title": "KB Builder: Chunk Overlap",
        "body": "Chunk overlap repeats a portion of text between adjacent chunks to preserve continuity. Tip: moderate overlap can improve answer quality, but too much overlap increases index size and redundancy.",
        "tags": ["kb", "kb-builder", "chunking"]
    },
    {
        "slug": "kb-embedding-models",
        "section_id": "kb-builder",
        "title": "KB Builder: Embedding Model",
        "body": "Embedding models convert text into vectors used for semantic search. Tip: keep the same embedding model for a knowledge base unless you plan to reindex all documents.",
        "tags": ["kb", "kb-builder", "embeddings"]
    },
    {
        "slug": "kb-what-are-embeddings",
        "section_id": "kb-builder",
        "title": "What Are Embeddings",
        "body": "Embeddings are numeric vectors that represent text meaning so semantically similar content can be found quickly. Tip: choose one embedding model per knowledge base and keep it consistent.",
        "tags": ["kb", "kb-builder", "embeddings"]
    },
    {
        "slug": "kb-embedding-dimensions",
        "section_id": "kb-builder",
        "title": "KB Builder: Embedding Dimensions",
        "body": "Embedding dimensions describe the vector size produced by the model. The index and query model must use matching dimensions. Tip: do not manually override dimensions unless you know the model requirements.",
        "tags": ["kb", "kb-builder", "embeddings"]
    },
    {
        "slug": "kb-indexing-pipeline",
        "section_id": "kb-builder",
        "title": "KB Builder: Indexing Pipeline",
        "body": "The indexing pipeline runs extraction, chunking, embedding, and storage so your files become searchable. Tip: run a small pilot set first to validate quality before indexing large libraries.",
        "tags": ["kb", "kb-builder", "indexing"]
    },
    {
        "slug": "kb-scope-project-vs-global",
        "section_id": "kb-builder",
        "title": "KB Builder: Scope",
        "body": "Scope decides where a knowledge base can be used. Project scope limits access to one project; global scope makes it available across projects. Tip: default to project scope for sensitive data.",
        "tags": ["kb", "kb-builder", "security"]
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
