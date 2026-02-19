
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
        "body": "Default model controls which model starts new conversations and many assistant-driven actions such as tool execution and planning. Different models vary significantly in reasoning depth, response speed, and VRAM usage — for example, a 7B parameter model responds quickly with modest memory but a 70B model gives deeper analysis at higher cost. The default applies to all new chats until you override it per-conversation using the model selector. Per-chat overrides do not change this default. Tip: start with a balanced general model like llama3:8b for everyday tasks, then switch to a larger or specialized model when a conversation demands deeper reasoning.",
        "tags": ["ai", "model"]
    },
    {
        "slug": "settings-default-temperature",
        "section_id": "ai",
        "title": "Default Temperature",
        "body": "Temperature controls the randomness of token selection during response generation, on a scale from 0.0 to 1.0. At 0.0 the model always picks the most likely next token, producing near-identical outputs for the same prompt. At 0.7-0.8 responses become more varied, which is useful for brainstorming or creative writing. For example, setting temperature to 0.1 for code review produces consistent, focused feedback, while 0.8 for story drafts yields more diverse ideas. The default applies to all new chats unless overridden. Tip: use 0.1-0.3 for code generation and ops tasks where precision matters, and 0.6-0.8 for ideation and creative work.",
        "tags": ["ai", "model"]
    },
    {
        "slug": "settings-system-prompt",
        "section_id": "ai",
        "title": "System Prompt",
        "body": "The system prompt is a hidden instruction block sent at the start of every new conversation that shapes the assistant's tone, focus, constraints, and output format. It works alongside project context, KB retrieval results, and tool outputs to produce grounded responses. For example, a system prompt like 'You are a senior backend engineer. Always suggest test cases alongside code changes.' focuses the assistant on engineering rigor. Changes here affect all new chats but do not retroactively alter existing conversations. Leave blank to use the platform default. Tip: keep instructions specific and actionable, test with 3-5 representative prompts, and revise based on where the assistant drifts from your intent.",
        "tags": ["ai", "prompt"]
    },
    {
        "slug": "settings-default-num-ctx",
        "section_id": "ai",
        "title": "Default Context Window",
        "body": "Context window controls how many tokens of conversation history the model can reference when generating a response. Higher values let the model recall earlier messages in long sessions, improving coherence for multi-turn planning and debugging. However, larger windows consume significantly more VRAM and may increase response latency, especially on consumer GPUs. Most local models default to 4096 tokens; some support 8K, 32K, or 128K. Tip: start with the model's recommended default and only increase if you notice the assistant forgetting important earlier context.",
        "tags": ["ai", "model", "performance"]
    },
    {
        "slug": "imagegen-prompt",
        "section_id": "image-gen",
        "title": "Prompt",
        "body": "The prompt is the primary text instruction that tells the image model what to generate, covering subject, composition, style, lighting, and quality modifiers. It is combined with your chosen checkpoint model, sampler, CFG scale, and any optional controls (LoRA, ControlNet, reference image) to produce the final output. Prompt order matters — models tend to weight earlier tokens more heavily, so lead with the most important elements. For example, 'cinematic portrait of an astronaut, golden hour lighting, film grain, 8k detail' places subject first, then atmosphere and quality. Tip: structure prompts from broad scene description to fine details, and iterate by changing one phrase at a time for controllable results.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-system-prompt",
        "section_id": "image-gen",
        "title": "Image System Context",
        "body": "Image system context is a global instruction block that is prepended to every image generation prompt you submit. It is separate from your chat system prompt so you can enforce persistent visual rules — such as lighting style, color palette, or quality modifiers — without affecting conversational AI behavior. This context applies across all projects unless overridden by a project-level image context. Tip: keep image system context focused on universal style rules and move project-specific constraints into the project image context field.",
        "tags": ["image", "generation", "context"]
    },
    {
        "slug": "imagegen-project-system-context",
        "section_id": "image-gen",
        "title": "Project Image Context",
        "body": "Project image context provides workspace-scoped instructions that are prepended to image generation prompts only within the current project. When set, these instructions override your global image system context for this project, letting you tailor style, subject, or quality rules per workspace. This is useful when different projects have distinct visual identities or brand guidelines. Tip: use project image context for campaign or client-specific rules while keeping your global context for universal quality defaults.",
        "tags": ["image", "generation", "context", "project"]
    },
    {
        "slug": "imagegen-workflow",
        "section_id": "image-gen",
        "title": "Workflow",
        "body": "Workflow selects the generation mode that determines how your prompt and inputs are processed. Text-to-image creates new images from scratch using only your text prompt. Image-to-image transforms an existing image guided by your prompt and denoise strength. Inpainting regenerates only the masked region of an image while preserving surrounding areas. Face-morph blends two faces or images using configurable morph strength. Tip: start with text-to-image to establish a base, then switch to image-to-image or inpainting for targeted refinements.",
        "tags": ["image", "generation", "workflow"]
    },
    {
        "slug": "imagegen-negative-prompt",
        "section_id": "image-gen",
        "title": "Negative Prompt",
        "body": "The negative prompt tells the image model what to avoid or suppress during generation, such as visual artifacts, anatomical distortions, or unwanted styles. It works as a counterweight to your main prompt — the model actively steers away from concepts listed here. For example, a baseline like 'blurry, low quality, watermark, deformed hands, extra fingers' addresses common diffusion model issues. Negative prompts are especially effective for removing persistent artifacts that reappear across generations. You can maintain a reusable baseline and add issue-specific terms per generation. Tip: keep a standard negative prompt saved in your image system context and only append extra terms when a specific issue appears in outputs.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-width",
        "section_id": "image-gen",
        "title": "Width",
        "body": "Width sets the horizontal pixel resolution of the generated image and directly affects composition balance, fine detail capacity, VRAM consumption, and rendering time. SD 1.5 models are trained at 512px and perform best near that range, while SDXL models are optimized for 1024px. Doubling resolution roughly quadruples VRAM usage and generation time, so iterating at lower resolution saves significant resources. For example, use 512x512 for rapid concept exploration, then re-render at 768x1024 or 1024x1024 for final output. Tip: start with the model's native resolution for fast iterations, then upscale or re-render at your target size once the composition is locked.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-height",
        "section_id": "image-gen",
        "title": "Height",
        "body": "Height sets the vertical pixel resolution and, together with width, defines the aspect ratio that controls visual framing and composition. Non-square ratios like 768x512 (landscape) or 512x768 (portrait) influence how the model arranges subjects within the frame. Some checkpoints produce artifacts at aspect ratios far from their training dimensions, so staying near native ratios gives best results. For example, a social media story might use 512x896 for a tall vertical format while a banner uses 1024x384. Tip: decide on your target platform's aspect ratio early — for example, 16:9 for desktop or 9:16 for mobile stories — to minimize reframing work later.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-steps",
        "section_id": "image-gen",
        "title": "Steps",
        "body": "Steps control how many denoising iterations the sampler performs to progressively refine the image from noise to final output. More steps generally improve detail and coherence, but with diminishing returns — going from 20 to 30 steps usually helps more than going from 40 to 50. Each additional step adds roughly proportional GPU time, so over-stepping wastes resources without visible improvement. The optimal step count depends on your sampler: euler works well at 20-30 steps, while dpmpp_2m can produce good results in 15-25 steps. For example, use 20 steps for quick iteration and 30-40 for final renders. Tip: find the sweet spot for your sampler by generating the same prompt at 15, 25, and 40 steps, then compare — the point where quality plateaus is your efficient default.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-cfg-scale",
        "section_id": "image-gen",
        "title": "CFG Scale",
        "body": "CFG (Classifier-Free Guidance) scale controls how strongly the model follows your text prompt versus its learned visual priors, on a typical range of 1 to 30. At low values (1-4) the model generates freely with loose prompt adherence, producing dreamier or more abstract results. At moderate values (6-8) you get a solid balance of prompt fidelity and visual quality. Very high values (15+) force strict prompt following but can cause oversaturation, harsh edges, or visual artifacts. For example, a photorealistic portrait typically works well at CFG 7, while a stylized illustration might benefit from CFG 4-5. Tip: stabilize your prompt wording and model choice first, then fine-tune CFG in increments of 1-2 to avoid chasing multiple variables simultaneously.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-mask-editor",
        "section_id": "image-gen",
        "title": "Inpaint Mask Editor",
        "body": "The mask editor lets you paint over the specific areas of an image you want the model to regenerate while leaving the rest untouched. White painted regions are rewritten according to your prompt, and black regions are fully preserved. Use the Erase brush to undo mask strokes and restore preserved areas before submitting. Mask precision directly affects how naturally the regenerated area blends with the surrounding image. Tip: paint slightly beyond object edges to give the model room to blend, and use a moderate denoise strength (0.5-0.8) for natural results.",
        "tags": ["image", "generation", "inpainting"]
    },
    {
        "slug": "imagegen-completion-notif",
        "section_id": "image-gen",
        "title": "Completion Notification",
        "body": "Completion notifications alert you when image generation jobs finish so you can work on other tasks without polling the Images panel. This is especially useful for batch generations, high-step workflows, or SDXL renders that may take 30-60 seconds or more. Notifications appear as in-app toasts by default, and can be combined with desktop and sound notifications for stronger signals. For example, generating a batch of 8 images at 40 steps may take several minutes — a notification lets you continue editing prompts or reviewing past outputs. Tip: pair completion notifications with desktop notifications if you frequently switch between browser tabs or applications during generation.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-desktop-notif",
        "section_id": "image-gen",
        "title": "Desktop Notification",
        "body": "Desktop notifications send operating-system level alerts for generation events even when the browser tab is not focused or is minimized. They appear as native OS popups alongside notifications from other apps, making them impossible to miss. Your browser must have notification permission granted for this site — Chrome and Edge will prompt you once, and the permission persists. For example, if you are working in your code editor while a long SDXL batch renders, a desktop notification pops up when results are ready. Tip: grant browser notification permission once on first use, then rely on the in-app notification settings to control which event types actually trigger desktop alerts.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-auto-delete-days",
        "section_id": "image-gen",
        "title": "Auto Delete Days",
        "body": "Auto delete removes generated images older than the specified number of days to prevent unchecked storage growth on the server. This runs automatically in the background and permanently deletes outputs that exceed the retention window. It is especially valuable during rapid experimentation phases where you may generate hundreds of images per day. For example, setting auto-delete to 7 days keeps only the past week of outputs, while 30 days retains a month of history. Deleted images cannot be recovered. Tip: export or star your best results before the cleanup window closes, and combine auto-delete with max stored generations for a two-layer retention strategy.",
        "tags": ["image", "generation"]
    },
    {
        "slug": "imagegen-max-generations",
        "section_id": "image-gen",
        "title": "Max Stored Generations",
        "body": "Max stored generations caps how many generated images are retained in your project history. When the limit is reached, the oldest generations are automatically removed to make room for new ones. Leave blank for unlimited retention. This is useful for high-volume experimentation where disk usage can grow quickly. Tip: combine this with auto-delete days for a two-layer cleanup strategy — time-based for general housekeeping and count-based for hard caps.",
        "tags": ["image", "generation", "storage"]
    },
    {
        "slug": "imagegen-comfyui-base-url",
        "section_id": "image-gen",
        "title": "ComfyUI Base URL",
        "body": "ComfyUI base URL overrides the default server endpoint for image generation requests. Leave blank to use the backend-configured default (typically http://comfyui:8188 inside Docker). Set a custom URL when running ComfyUI on a different host, port, or remote GPU server. The backend validates connectivity to this endpoint before submitting generation jobs. Tip: if you run ComfyUI outside Docker, use your machine's LAN IP rather than localhost so the backend container can reach it.",
        "tags": ["image", "generation", "integration"]
    },
    {
        "slug": "imagegen-model",
        "section_id": "image-gen",
        "title": "Model (Checkpoint)",
        "body": "The checkpoint model is the core neural network that determines the visual style and capabilities of your generated images. Different checkpoints are trained for different domains — realistic photography, anime/illustration, architectural visualization, or general-purpose use. The selected model must be installed in ComfyUI's checkpoints directory to appear in the dropdown. SDXL models produce higher-resolution outputs but require more VRAM than SD 1.5 models. Tip: try a general-purpose model first, then switch to domain-specific checkpoints once you know the visual direction you need.",
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
        "body": "Files is the source-of-truth panel for code, prompts, assets, and configuration in a project. Changes you make here feed directly into the Run panel for execution, the Tools panel for file-based operations, Planning for implementation tracking, and Chat for grounded AI responses when file context is active. For example, editing a Python script in Files and then switching to Run lets you execute it immediately without leaving the workspace. History records every file change for auditability, and Events can trigger on file modifications. Tip: keep a clear folder structure so automation scripts, tool references, and teammates can locate inputs quickly.",
        "tags": ["workspace", "files"]
    },
    {
        "slug": "workspace-run",
        "section_id": "workspace",
        "title": "Run",
        "body": "Run executes shell commands inside the project's active container environment — typically after editing files in the Files panel or triggering an Action. Output and exit codes are captured in History for review and appear as events in the Events panel if persistence is enabled. Chat can reference run results to suggest fixes or next steps based on command output. For example, running 'npm test' after editing a component lets you validate changes, and if tests fail, Chat can analyze the error log and suggest corrections. Tip: validate small or safe commands first (like 'ls' or 'echo') before launching longer workflows to confirm the environment is ready.",
        "tags": ["workspace", "run"]
    },
    {
        "slug": "workspace-actions",
        "section_id": "workspace",
        "title": "Actions",
        "body": "Actions provide reusable automation for file operations, command execution, dependency installs, and workflow shortcuts that you would otherwise type manually in Run. They bridge manual editing in Files with repeatable execution — for example, an Action can lint, build, and test your code in a single click. Action outcomes feed into History for auditing and Events for automation hooks. Chat can suggest creating Actions when it detects repetitive command patterns in your workflow. Tip: create Actions for tasks you repeat more than twice so execution stays consistent across runs and team members.",
        "tags": ["workspace", "actions"]
    },
    {
        "slug": "workspace-history",
        "section_id": "workspace",
        "title": "History",
        "body": "History shows a chronological timeline of every change, run, tool execution, and system event within the project for troubleshooting and auditability. It connects outcomes from Actions, Run, Tools, and file edits so you can trace exactly what happened and when. For example, if a build suddenly fails, History lets you see which file was edited or which Action was run just before the failure. Chat can reference History entries when helping you debug, and Events persist important milestones from this timeline. Tip: check History first when behavior changes unexpectedly — it often reveals the recent change that caused the issue faster than re-reading code.",
        "tags": ["workspace", "history"]
    },
    {
        "slug": "workspace-images",
        "section_id": "workspace",
        "title": "Images",
        "body": "Images centralizes all generated outputs, their metadata, and iteration history from image generation workflows in one browsable gallery. Each image records the exact prompt, negative prompt, model, sampler, seed, CFG, steps, and any LoRA or ControlNet settings used, so you can reproduce or iterate on any result. The panel connects directly to the Prompt tab for re-generation and to Resources for exporting images as project assets. For example, finding a good result and noting its seed lets you regenerate the same composition with a different style by only changing the checkpoint model. Tip: review seed and full workflow metadata when recreating a result, and star your best outputs before auto-delete cleanup runs.",
        "tags": ["workspace", "images"]
    },
    {
        "slug": "workspace-resources",
        "section_id": "workspace",
        "title": "Resources",
        "body": "Resources manages reusable project inputs such as datasets, configuration files, model assets, and reference documents that are used across multiple panels. Tools can read from Resources for stable file references, Chat can inject resource content as context, and image generation workflows can source reference images from here. For example, storing a brand guidelines document in Resources lets both Chat and the KB pipeline reference it without path ambiguity. Resources persist with the project and are included in snapshots and exports. Tip: store canonical assets in Resources instead of ad-hoc file paths so tools, automation, and teammates always reference the same authoritative version.",
        "tags": ["workspace", "resources"]
    },
    {
        "slug": "workspace-events",
        "section_id": "workspace",
        "title": "Events",
        "body": "Events provides real-time and persisted signaling for important workflow state changes, failures, completion milestones, and custom automation hooks. It aggregates signals from Run (command results), Actions (automation outcomes), Tools (execution results), and system-level changes into a unified event stream. External listeners and webhook integrations can subscribe to specific event types for downstream automation. For example, a 'build.failed' event from a Run command can trigger an alert in your monitoring system, while a 'generation.completed' event signals that image outputs are ready. Tip: standardize event type naming with a consistent convention like 'domain.action' early in your project so filtering, dashboards, and automation rules stay clean as the project grows.",
        "tags": ["workspace", "events"]
    },
    {
        "slug": "workspace-drupal",
        "section_id": "workspace",
        "title": "Drupal",
        "body": "The Drupal panel connects your workspace to remote Drupal environments for content CRUD operations, staging clone/push, and live preview validation. It works alongside Chat for conversation-driven content editing — for example, asking Chat to 'update the homepage hero text' triggers a Drupal tool that modifies the node via JSON:API. Changes can be previewed in the panel before committing to production, and all operations are logged in History and Events. Tools in the workspace can also execute Drupal operations programmatically for batch workflows. Tip: always test content changes against a staging environment first, and verify in the Drupal preview pane before pushing to production.",
        "tags": ["workspace", "drupal"]
    },
    {
        "slug": "workspace-kb",
        "section_id": "workspace",
        "title": "Knowledge Base",
        "body": "Knowledge Base stores indexed documents that power retrieval-augmented generation (RAG) — when you ask a question in Chat, the system searches the KB for semantically relevant chunks and injects them into the AI's context for grounded, accurate responses. KB quality directly depends on the extraction, chunking, and embedding pipeline configured in the KB Builder. Poor source documents or misconfigured chunk sizes lead to irrelevant retrievals, while clean, well-chunked content produces precise answers. Tools can also query the KB programmatically for automated workflows. For example, indexing your API documentation lets Chat answer endpoint questions with exact parameter details rather than guessing. Tip: curate source documents before indexing — remove duplicate content, fix formatting issues, and test retrieval with representative queries before bulk ingestion.",
        "tags": ["workspace", "kb"]
    },
    {
        "slug": "workspace-snapshots",
        "section_id": "workspace",
        "title": "Snapshots",
        "body": "Snapshots capture the complete project state — files, settings, context, and resource references — at a point in time so you can roll back experiments, compare iterations, or recover from mistakes. They complement source control (git) by also preserving workspace runtime context that git does not track, such as active tool configurations and panel layouts. Snapshots are referenced in History so you can see when they were created relative to other changes. For example, creating a snapshot before a major dependency upgrade lets you restore the entire workspace if the upgrade breaks something. Tip: create a snapshot before large refactors, dependency upgrades, or experimental prompt changes so you have a clean rollback point.",
        "tags": ["workspace", "snapshots"]
    },
    {
        "slug": "workspace-context",
        "section_id": "workspace",
        "title": "Context",
        "body": "Context controls the background information injected into every Chat message — including custom snippets, project references, pinned instructions, and KB retrieval results. This directly influences Chat response quality, Planning step relevance, and the accuracy of Tool suggestions because the AI reasons over this context alongside your message. Overloaded or stale context degrades output quality by consuming token budget with irrelevant information. For example, pinning a 'coding standards' snippet ensures every Chat response follows your team's conventions, while removing an outdated API reference prevents the AI from suggesting deprecated endpoints. Tip: keep context high-signal by reviewing pinned items monthly, removing stale instructions, and limiting total context size to leave room for conversation history.",
        "tags": ["workspace", "context"]
    },
    {
        "slug": "workspace-planning",
        "section_id": "workspace",
        "title": "Planning",
        "body": "Planning mode breaks complex work into sequenced steps with explicit progress tracking, checkpoints, and dependencies between tasks. It coordinates activity across Files (what to edit), Run (how to validate), Tools (what to execute), and Chat (reasoning about next steps) under a single implementation strategy. Each plan step can reference specific files, commands, or tool invocations, and progress is tracked in History. For example, a plan to 'add user authentication' might sequence steps for model changes, API route creation, frontend integration, and test writing with dependencies between them. Tip: keep plans outcome-focused rather than prescriptive, update steps as implementation reveals new requirements, and reference specific files in each step for clarity.",
        "tags": ["workspace", "planning"]
    },
    {
        "slug": "workspace-tools",
        "section_id": "workspace",
        "title": "Tools",
        "body": "Tools exposes callable capabilities — shell commands, API actions, file operations, and project-specific integrations — that the Chat assistant can invoke to turn conversation intent into concrete work. Each tool has defined parameters, and executions are logged in History and optionally surfaced as Events for automation. Tools interact with Files for reading and writing, Run for command execution, and Drupal for content operations. For example, the assistant might use a 'write_file' tool to create a new component after you describe it in Chat, then call a 'run_command' tool to execute tests. Tip: review tool parameters carefully before approving execution, start with safe defaults, and require explicit approval for tools that modify production systems.",
        "tags": ["workspace", "tools"]
    },
    {
        "slug": "workspace-ui-builder",
        "section_id": "workspace",
        "title": "UI Builder",
        "body": "UI Builder combines prompt-driven component generation with visual preview iteration, letting you design interface layouts, forms, and widgets without manually writing all the markup. It connects to Chat for design reasoning — for example, you can describe a dashboard layout in Chat and UI Builder generates a live-previewable prototype. Generated components can be exported to Files as project assets, and Palette colors from the sidebar are available for consistent theming. For example, asking 'create a settings form with dark mode toggle and notification preferences' generates an interactive preview you can refine visually. Tip: iterate in short cycles — generate, preview, refine the prompt, regenerate — and save reusable patterns to project Files for consistent reuse.",
        "tags": ["workspace", "ui-builder", "design"]
    },
    {
        "slug": "workspace-chat",
        "section_id": "workspace",
        "title": "Chat",
        "body": "Chat is the primary orchestration surface where you interact with the AI assistant for reasoning, planning, and tool-assisted execution. The assistant draws on Context panel instructions, Files content, Knowledge Base retrieval results, and Tool outputs to produce grounded, project-aware responses. Chat can trigger actions in other panels — for example, asking 'run the test suite' invokes Run, asking 'update the hero section' triggers a Drupal tool, and asking 'create a utility function' writes to Files. Planning mode structures multi-step work within Chat, and all interactions appear in History. Tip: provide concrete goals, constraints, and expected output format in your first message for higher-quality responses — for example, 'Write a Python function that validates email addresses, include edge cases in docstring examples.'",
        "tags": ["workspace", "chat"]
    },
    {
        "slug": "workspace-help",
        "section_id": "workspace",
        "title": "Help",
        "body": "Help provides searchable documentation for every field, workflow, and panel interaction across the application, designed for in-context learning without leaving your workspace. Each panel's help topics explain how that panel connects to others — for example, the Files help topic explains how edits feed into Run and Chat context. You can reach Help from any FieldHelp icon (the small question marks next to fields) or from the sidebar. For example, clicking the help icon on the CFG Scale slider shows a quick tip, and 'Read more' opens the full Help article with usage guidance. Tip: use section filters to narrow results to the relevant panel, and search by feature name first before browsing.",
        "tags": ["workspace", "help"]
    },
    {
        "slug": "workspace-close",
        "section_id": "workspace",
        "title": "Close Project",
        "body": "Close Project exits the active workspace and returns you to the project selection screen without deleting any project data, files, history, or settings. All workspace state — including Files, Resources, Context, and KB indexes — is preserved and available when you reopen the project. Running processes in the project's container may continue or be stopped depending on your sandbox configuration. For example, closing a project to switch to a different client workspace does not affect the first project's files or chat history. Tip: save any unsaved file edits and create a Snapshot before closing a major work session, especially if you have been experimenting with settings or context changes.",
        "tags": ["workspace", "close"]
    },
    {
        "slug": "workspace-settings",
        "section_id": "workspace",
        "title": "Settings",
        "body": "Workspace Settings control project-level defaults and integrations that affect behavior across all panels — including Chat's system prompt overrides, Tool configurations, image generation defaults, and resource management preferences. Changes here apply only to the current project and do not affect your global user preferences or other projects. For example, setting a project-specific image system context here ensures all image generations within this workspace follow the same visual guidelines, while a different project can have its own rules. Settings are preserved in Snapshots and included in project exports. Tip: align workspace settings with team conventions at project creation time to prevent configuration drift as work progresses.",
        "tags": ["workspace", "settings"]
    },
    {
        "slug": "notes-overview",
        "section_id": "notes",
        "title": "Notes",
        "body": "Notes let you capture quick thoughts, bug reports, and task reminders with optional category tagging and AI-generated titles. Pin important notes to keep them visible, assign them to projects for scoping, and promote bugs to trackable Issues with a single click. The Export App Bugs feature gathers all notes in the App Bugs category into a Claude Code-friendly markdown file. Notes support Kanban board view for visual organization. Tip: use the Ctrl+Shift+N shortcut to open the Notes panel from anywhere in the app.",
        "tags": ["notes", "productivity", "kanban"]
    },
    {
        "slug": "issues-overview",
        "section_id": "issues",
        "title": "Issues",
        "body": "Issues provide project-scoped bug and task tracking with severity levels (low, medium, high, critical), status workflow (open, in_progress, resolved, closed), and direct integration with your sandbox environment. Use Start Fix to auto-create a git branch in the project sandbox, then link a PR URL for review tracking. Issues can be promoted from Notes or created directly. The severity and status fields drive filtering and priority views. Tip: promote a Note to an Issue when a quick observation becomes a concrete bug that needs a fix branch and PR.",
        "tags": ["issues", "bugs", "tracking", "workflow"]
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
        "body": "ControlNet type determines the preprocessing method applied to your guide image before it constrains generation. Each type extracts different structural information: canny detects edges and outlines, depth estimates spatial layout and perspective, openpose identifies human body poses, lineart produces clean line drawings, scribble interprets rough sketches, and softedge gives a more forgiving edge map. The preprocessor runs automatically when you submit a guide image. Tip: use canny for preserving sharp outlines, depth for architectural scenes, and openpose for controlling human poses.",
        "tags": ["image", "generation", "controlnet"]
    },
    {
        "slug": "imagegen-controlnet-strength",
        "section_id": "image-gen",
        "title": "ControlNet Strength",
        "body": "ControlNet strength controls the influence of the structure guide on the generated output, on a scale from 0 to 2. At 0, the guide is effectively ignored and the model generates freely. Values around 0.8 to 1.0 provide a good balance between structural fidelity and creative freedom. Values above 1.0 enforce strict adherence but can produce artifacts if the guide conflicts with the prompt. Tip: start at 0.8-1.0 and adjust in 0.1 increments — small changes have noticeable effects on composition.",
        "tags": ["image", "generation", "controlnet"]
    },
    {
        "slug": "imagegen-reference-weight",
        "section_id": "image-gen",
        "title": "Reference Weight",
        "body": "Reference weight controls how strongly the IPAdapter style transfer from your reference image influences the generated output, on a scale from 0% to 150%. At 0%, the reference is ignored entirely and the model relies only on your text prompt. Around 50-70%, you get a balanced blend of reference style and prompt guidance. Above 100%, the reference dominates and the text prompt has less influence on visual style. Tip: begin near 50-70% for a balanced blend, then increase if the style transfer feels too subtle.",
        "tags": ["image", "generation", "style-transfer"]
    },
    {
        "slug": "imagegen-reference-noise",
        "section_id": "image-gen",
        "title": "Reference Noise",
        "body": "Reference noise introduces controlled randomness into the style transfer process so outputs are not an exact reproduction of the reference image. At 0%, the model tries to faithfully reproduce the reference style, color palette, and composition. Higher noise values encourage the model to interpret the reference more loosely, producing creative variations while still drawing from the source aesthetic. Tip: keep noise low (0-20%) for faithful style transfer and increase it (30-60%) when you want diverse interpretations of the reference.",
        "tags": ["image", "generation", "style-transfer"]
    },
    {
        "slug": "kb-file-types",
        "section_id": "kb-builder",
        "title": "KB Builder: Supported File Types",
        "body": "The KB builder accepts a range of document formats including PDF, plain text, Markdown, HTML, and common office formats (DOCX, XLSX). Each format is handled by a dedicated extractor that converts the file into machine-readable text before chunking and embedding. Scanned or image-heavy PDFs may require OCR or vision model extraction for best results. Tip: prefer clean, text-rich files to minimize extraction errors, and test a sample file before bulk-uploading large libraries.",
        "tags": ["kb", "kb-builder", "documents"]
    },
    {
        "slug": "kb-text-extraction",
        "section_id": "kb-builder",
        "title": "KB Builder: Text Extraction",
        "body": "Text extraction is the first stage of the KB pipeline, converting uploaded files into machine-readable plain text. The extractor automatically selects the right parser based on file type — for example, PDF text extraction, HTML stripping, or office document conversion. Extraction quality directly affects downstream chunking and retrieval accuracy, so garbage-in means garbage-out. Tip: verify extracted text samples by reviewing a few chunks before committing to a full batch indexing run.",
        "tags": ["kb", "kb-builder", "extraction"]
    },
    {
        "slug": "kb-ocr-explained",
        "section_id": "kb-builder",
        "title": "KB Builder: OCR",
        "body": "OCR (Optical Character Recognition) reads text from images, scanned documents, and image-heavy PDFs where standard text extraction returns little or no content. Enable OCR when your source files contain photographed pages, infographics, or handwritten notes that need to be searchable. OCR accuracy depends on image resolution, contrast, and font clarity. Tip: use scans of at least 300 DPI for best OCR quality, and review a sample of extracted text before indexing the full batch.",
        "tags": ["kb", "kb-builder", "ocr"]
    },
    {
        "slug": "kb-vision-models",
        "section_id": "kb-builder",
        "title": "KB Builder: Vision Models",
        "body": "Vision models apply multimodal AI to understand document images beyond what plain OCR can capture — such as interpreting charts, diagrams, complex layouts, or handwritten annotations. They analyze the visual structure of each page and produce richer text descriptions than character-level OCR alone. Vision extraction is slower and more resource-intensive than standard text parsing. Tip: choose lighter vision models for speed on simple documents and reserve heavier models for complex layouts with charts, tables, or mixed media.",
        "tags": ["kb", "kb-builder", "vision"]
    },
    {
        "slug": "kb-chunking-overview",
        "section_id": "kb-builder",
        "title": "KB Builder: Chunking Overview",
        "body": "Chunking splits extracted text into smaller, semantically coherent pieces that fit within embedding model token limits and improve retrieval precision. Without chunking, long documents would be stored as single vectors, making it hard to retrieve specific passages. The chunking strategy — including size, overlap, and splitting method — directly affects how well search queries match relevant content. Tip: start with a preset chunk configuration, run a few test queries, and only fine-tune chunk size and overlap if retrieval quality needs improvement.",
        "tags": ["kb", "kb-builder", "chunking"]
    },
    {
        "slug": "kb-chunk-size",
        "section_id": "kb-builder",
        "title": "KB Builder: Chunk Size",
        "body": "Chunk size sets the target number of tokens per text chunk during the splitting phase. Larger chunks (800-1500 tokens) preserve more surrounding context, which helps when answers span multiple paragraphs. Smaller chunks (200-500 tokens) improve retrieval precision by isolating specific facts, but may lose broader context. The ideal size depends on your document structure and query patterns. Tip: use medium chunk sizes (400-600 tokens) for most general-purpose knowledge bases and adjust after testing retrieval quality.",
        "tags": ["kb", "kb-builder", "chunking"]
    },
    {
        "slug": "kb-chunk-overlap",
        "section_id": "kb-builder",
        "title": "KB Builder: Chunk Overlap",
        "body": "Chunk overlap repeats a portion of text between adjacent chunks so that sentences split across chunk boundaries are still captured in at least one chunk. This prevents information loss at split points and improves retrieval when relevant content spans two chunks. Typical overlap ranges from 10% to 25% of chunk size. Too much overlap inflates index size and increases redundancy without proportional quality gains. Tip: set overlap to about 15-20% of chunk size as a starting point and increase only if you notice retrieval gaps at chunk boundaries.",
        "tags": ["kb", "kb-builder", "chunking"]
    },
    {
        "slug": "kb-embedding-models",
        "section_id": "kb-builder",
        "title": "KB Builder: Embedding Model",
        "body": "The embedding model converts text chunks into numerical vectors that capture semantic meaning, enabling similarity-based search rather than keyword matching. Different models produce vectors of different dimensions and quality — larger models generally capture more nuance but are slower. The embedding model used at index time must match the one used at query time, so changing models requires reindexing all documents. Tip: pick one embedding model per knowledge base and keep it consistent; only switch if you plan to reindex everything.",
        "tags": ["kb", "kb-builder", "embeddings"]
    },
    {
        "slug": "kb-what-are-embeddings",
        "section_id": "kb-builder",
        "title": "What Are Embeddings",
        "body": "Embeddings are high-dimensional numeric vectors that encode the semantic meaning of text, allowing the system to find content by meaning rather than exact keywords. When you search a knowledge base, your query is embedded into the same vector space and compared against stored chunk vectors using cosine similarity. This is what makes retrieval-augmented generation (RAG) possible — the most semantically relevant chunks are injected into the AI's context. Tip: embedding quality depends on the model used, so choose a well-regarded embedding model and keep it consistent across your knowledge base.",
        "tags": ["kb", "kb-builder", "embeddings"]
    },
    {
        "slug": "kb-embedding-dimensions",
        "section_id": "kb-builder",
        "title": "KB Builder: Embedding Dimensions",
        "body": "Embedding dimensions define the length of the vector produced by the embedding model — for example, 384, 768, or 1024 floats per chunk. Higher dimensions can capture finer semantic distinctions but increase storage and query cost. The dimension must match between the embedding model and the vector index; a mismatch causes search failures. This value is typically set automatically based on the selected model. Tip: do not manually override dimensions unless you are using a custom model with non-standard output size.",
        "tags": ["kb", "kb-builder", "embeddings"]
    },
    {
        "slug": "kb-indexing-pipeline",
        "section_id": "kb-builder",
        "title": "KB Builder: Indexing Pipeline",
        "body": "The indexing pipeline orchestrates the full sequence of extraction, chunking, embedding, and vector storage that transforms raw documents into a searchable knowledge base. Each stage feeds into the next: extraction produces text, chunking splits it into pieces, embedding converts pieces to vectors, and storage writes vectors to the index. Pipeline progress and errors are reported in real time so you can catch issues early. Tip: run a small pilot set of 5-10 representative documents first to validate extraction and retrieval quality before indexing large libraries.",
        "tags": ["kb", "kb-builder", "indexing"]
    },
    {
        "slug": "kb-scope-project-vs-global",
        "section_id": "kb-builder",
        "title": "KB Builder: Scope",
        "body": "Scope determines the visibility and access boundary of a knowledge base. Project scope restricts the KB to a single workspace, keeping its content isolated from other projects. Global scope makes the KB available across all projects for the same user or team, which is useful for shared reference material like company docs or API references. Scope cannot be changed after indexing without rebuilding the KB. Tip: default to project scope for sensitive or client-specific data, and use global scope only for broadly applicable reference material.",
        "tags": ["kb", "kb-builder", "security"]
    },
    {
        "slug": "settings-theme",
        "section_id": "profile",
        "title": "Theme",
        "body": "Switch between Light, Dark, or System theme. System automatically follows your OS preference and is the most accessible default. Dark mode reduces eye strain in low-light environments; Light mode provides maximum contrast in bright settings. Tip: System theme is recommended so the app always matches your desktop appearance.",
        "tags": ["settings", "appearance", "theme"]
    },
    {
        "slug": "settings-chat-modes",
        "section_id": "ai",
        "title": "Chat Modes",
        "body": "Each chat mode applies a different system prompt modifier that shapes how the AI responds. Modes like Code, Plan, and Help focus the AI on specific tasks. You can customize the prompt modifier for each mode or reset to built-in defaults. Tip: switch modes mid-conversation to change the AI's behavior on the fly.",
        "tags": ["settings", "chat", "modes", "system-prompt"]
    },
    {
        "slug": "settings-chat-mode-prompt-override",
        "section_id": "ai",
        "title": "Prompt Modifier",
        "body": "This text is prepended to the base system prompt when a chat mode is active. It shapes the AI's tone, focus, and output format for that specific mode. Leave the field empty to use the built-in default. Tip: keep modifiers concise — a few sentences is usually enough to steer behavior without crowding the context window.",
        "tags": ["settings", "chat", "modes", "system-prompt"]
    },
    {
        "slug": "settings-new-password",
        "section_id": "security",
        "title": "New Password",
        "body": "Must be at least 8 characters and include uppercase, lowercase, a digit, and a special character. A strong password protects your account from brute-force attacks. Tip: use a password manager to generate and store a unique password for this account.",
        "tags": ["security", "password"]
    },
    {
        "slug": "settings-confirm-password",
        "section_id": "security",
        "title": "Confirm New Password",
        "body": "Re-enter your new password exactly as typed in the New Password field. This confirmation step prevents typos from locking you out of your account. If the two fields do not match, the form will show an error and the password will not be changed.",
        "tags": ["security", "password"]
    },
    {
        "slug": "resource-remember-preference",
        "section_id": "workspace",
        "title": "Remember Preference Permanently",
        "body": "When enabled, your VRAM offload preferences (auto-unload, idle timeout, threshold, and preemption strategy) are saved to your user account in the database and persist across browser sessions, device changes, and server restarts. When disabled, preferences are stored only in your current browser session and reset after 1 hour of inactivity, meaning you would need to reconfigure them each time. This affects how aggressively the system manages GPU memory on your behalf. For example, if you have tuned a 10-minute idle timeout with LRU preemption for your GPU workflow, enabling this toggle ensures those settings survive a browser restart. Tip: enable this once you have tested and settled on offload settings that work well for your typical model and image generation workloads.",
        "tags": ["resources", "offload", "vram"]
    },
    {
        "slug": "resource-auto-unload-idle",
        "section_id": "workspace",
        "title": "Auto-Unload Idle Resources",
        "body": "When enabled, models that have not been queried for the configured idle timeout are automatically moved from GPU VRAM to CPU RAM. This frees expensive GPU memory for other tasks — for example, freeing 4 GB of VRAM occupied by an idle chat model so an SDXL image generation can run without out-of-memory errors. The model weights remain in system RAM, so reloading back into VRAM takes only a few seconds rather than the 10-30 seconds needed to load from disk. No model data is deleted; the model simply moves between memory tiers. Tip: enable this if you frequently switch between chat models and image generation, or if your GPU has limited VRAM (8-12 GB) that needs to be shared across tasks.",
        "tags": ["resources", "offload", "vram", "idle"]
    },
    {
        "slug": "resource-idle-timeout",
        "section_id": "workspace",
        "title": "Idle Timeout",
        "body": "Idle timeout is the number of minutes a model must sit without any inference requests before the auto-unload system moves it from GPU VRAM to CPU RAM. Lower values like 5-10 minutes aggressively free VRAM, which is useful when you regularly alternate between chat and image generation on a single GPU. Higher values like 30-60 minutes keep the model warm in VRAM for faster responses during intermittent use. For example, if you chat for 5 minutes then switch to generating images for 20 minutes, a 10-minute timeout ensures the chat model is offloaded and VRAM is available for ComfyUI. Tip: set 5-15 minutes if you actively run image generation alongside chat, or 30+ minutes if you mostly use chat and want instant responses after brief pauses.",
        "tags": ["resources", "offload", "vram", "idle"]
    },
    {
        "slug": "resource-vram-threshold",
        "section_id": "workspace",
        "title": "VRAM Warning Threshold",
        "body": "This percentage threshold triggers a warning banner in the UI when GPU VRAM utilization exceeds it, alerting you before out-of-memory (OOM) errors occur. On a 12 GB GPU, an 80% threshold warns at ~9.6 GB used, giving you time to unload an idle model before loading a new one. A 90% threshold on the same GPU warns only at ~10.8 GB, leaving very little headroom. The warning does not automatically unload anything — it is purely informational so you can take manual action or let the preemption strategy handle it. For example, with two 4 GB models loaded and ComfyUI reserving 3 GB, your 12 GB GPU would be at 92% and trigger the alert. Tip: set 75-80% if you frequently hit OOM errors, or 90% if you want alerts only when VRAM is critically full.",
        "tags": ["resources", "offload", "vram", "monitoring"]
    },
    {
        "slug": "resource-preemption-strategy",
        "section_id": "workspace",
        "title": "Preemption Strategy",
        "body": "Preemption strategy determines which loaded model is offloaded from GPU VRAM to CPU RAM first when the system needs to free memory for a new model or GPU task. LRU (Least Recently Used) evicts the model that has gone the longest without a query, which works well for typical chat workflows where the most recent model is the one you need. Priority-based eviction lets you mark certain models as high-priority so they stay loaded while less important ones are evicted first. Largest VRAM First frees the maximum amount of memory in a single eviction, which is useful when you need to make room quickly for a large model. For example, if you have a 3 GB and a 7 GB model loaded and need 8 GB free, Largest VRAM First evicts the 7 GB model in one step. Tip: LRU is the best default for most workflows; switch to Largest VRAM First only if you frequently load very large models that need maximum contiguous VRAM.",
        "tags": ["resources", "offload", "vram", "strategy"]
    },
    {
        "slug": "model-selector-installed",
        "section_id": "ai",
        "title": "Installed Models",
        "body": "Installed models are checkpoint files already downloaded to your local disk (typically 2-40 GB each) and ready to be loaded into GPU VRAM for inference. Models in this tab can be in one of two states: 'On disk' (downloaded but not loaded, consuming only disk space) or 'In VRAM' (loaded into GPU memory and ready for immediate chat responses). Select a model and click Apply to set it as the active model — if it is not yet in VRAM, it will be loaded automatically, which takes 5-30 seconds depending on size. For example, a 7B Q4 model uses about 4 GB of VRAM when loaded, leaving room for other models or image generation on a 12 GB GPU. Tip: keep only the models you actively use installed to save disk space, and unload models from VRAM when switching tasks to free GPU memory.",
        "tags": ["models", "ollama", "vram"]
    },
    {
        "slug": "model-selector-not-installed",
        "section_id": "ai",
        "title": "Not Installed Models",
        "body": "This tab shows models available from the Ollama registry that have not yet been downloaded to your local disk. Clicking the download icon or a size badge starts a pull that saves the model file locally — no VRAM is used until you explicitly load the model. Download sizes range from ~1 GB for small quantized 3B models to 40+ GB for large 70B models, so ensure you have sufficient disk space before pulling. Quantization variants like Q4_K_M offer a balance of quality and size — a Q4 version of a 13B model might be 7 GB compared to 26 GB for the full-precision version. For example, pulling llama3:8b-q4_K_M downloads about 4.7 GB and gives strong general-purpose performance. Tip: start with smaller quantized variants (Q4_K_M or Q5_K_M) for faster downloads and lower disk usage, then upgrade to larger quants only if output quality needs improvement.",
        "tags": ["models", "ollama", "download"]
    },
    {
        "slug": "model-selector-cloud",
        "section_id": "ai",
        "title": "Cloud Models",
        "body": "Cloud models run on remote servers operated by providers like OpenAI, Anthropic, and Google, so they consume zero local VRAM and zero local disk space. They require an active internet connection and a valid API key configured in your backend environment variables. Response latency depends on network speed and provider load rather than your GPU. Cloud models typically offer larger context windows (32K-128K+ tokens) than local models, making them useful for tasks involving long documents or extensive conversation history. However, they incur per-token costs that can add up during heavy use. For example, using Claude for a long planning session may process 50K tokens at a few cents per query. Tip: use cloud models for tasks that need large context windows or reasoning capabilities beyond your local GPU, and switch to local models for routine tasks to avoid per-token costs.",
        "tags": ["models", "cloud", "api"]
    },
    {
        "slug": "model-action-load",
        "section_id": "ai",
        "title": "Load Model into VRAM",
        "body": "Loading copies model weight data from your local disk into GPU VRAM, making the model available for real-time inference including chat, completions, and embeddings. The model file remains on disk (no disk space is freed) while a copy occupies GPU VRAM for the duration it stays loaded. A 7B Q4 model typically uses about 4 GB of VRAM and loads in 5-10 seconds, while a 13B model may use 8 GB and take 15-20 seconds. If your GPU does not have enough free VRAM, loading will fail with an out-of-memory error — you must unload another model first or let the preemption strategy handle it. For example, on a 12 GB GPU with 4 GB already used by another model, you have 8 GB free and can load most 7B-13B models. Tip: check the VRAM usage dashboard before loading large models to ensure sufficient free memory, and unload idle models first if needed.",
        "tags": ["models", "ollama", "vram", "load"]
    },
    {
        "slug": "model-action-unload",
        "section_id": "ai",
        "title": "Unload Model from VRAM",
        "body": "Unloading removes the model's weight data from GPU VRAM and returns it to a disk-only state, immediately freeing the VRAM it occupied. The model file on disk is not affected — you can reload it at any time without re-downloading, though reloading takes 5-30 seconds depending on model size. This is the primary way to free GPU memory for other tasks such as loading a different chat model or running ComfyUI image generation. For example, unloading a 7B model frees ~4 GB of VRAM, which is enough to load a different model or run a standard Stable Diffusion 1.5 generation. No data is lost — think of it as moving the model from fast GPU memory back to slower disk storage. Tip: unload models you are not actively using to maximize available VRAM, especially before starting image generation sessions that need significant GPU memory.",
        "tags": ["models", "ollama", "vram", "unload"]
    },
    {
        "slug": "model-action-delete",
        "section_id": "ai",
        "title": "Delete Model",
        "body": "Deleting permanently removes the model's weight file from your local disk, freeing the disk space it occupied (typically 2-40 GB depending on the model). This is irreversible — to use the model again you must re-download it from the Ollama registry, which can take minutes to hours depending on model size and connection speed. The model must be unloaded from VRAM before it can be deleted; if it is currently loaded, unload it first. Deleting does not affect other installed models or your chat history — only the selected model file is removed. For example, deleting a 13B Q4 model frees about 7 GB of disk space. Tip: only delete models you are confident you no longer need, and consider that a 40 GB model on a slow connection could take over an hour to re-download.",
        "tags": ["models", "ollama", "delete"]
    },
    {
        "slug": "model-action-pull",
        "section_id": "ai",
        "title": "Pull Model",
        "body": "Pulling downloads a model's weight file from the Ollama registry to your local disk, making it available for loading into GPU VRAM. The download only uses disk space — no VRAM is consumed until you explicitly load the model. Download progress is shown at the top of the dialog with percentage and speed indicators. File sizes range from ~1 GB for small 3B quantized models to 40+ GB for large 70B models, so download time depends on your connection speed. For example, pulling mistral:7b-q4_K_M downloads about 4.1 GB and takes roughly 2 minutes on a 300 Mbps connection. Once complete, the model moves to the Installed tab. Tip: ensure you have at least 2x the model size in free disk space before pulling (Ollama uses temporary space during download), and prefer Q4_K_M quantization as a starting point for balanced quality and size.",
        "tags": ["models", "ollama", "download", "pull"]
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
