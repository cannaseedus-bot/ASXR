/**
 * Google Colab Integration
 * Generate one-click Colab notebooks for fine-tuning
 */

import { promises as fs } from 'fs';
import path from 'path';

export class ColabIntegration {
  /**
   * Generate Colab notebook for fine-tuning with Crown data
   */
  async generateFineTuningNotebook(crownName, modelId, options = {}) {
    console.log(`[Colab] Generating fine-tuning notebook for ${modelId} with Crown ${crownName}...`);

    const notebook = {
      "nbformat": 4,
      "nbformat_minor": 0,
      "metadata": {
        "colab": {
          "provenance": [],
          "gpuType": "T4"
        },
        "kernelspec": {
          "name": "python3",
          "display_name": "Python 3"
        },
        "language_info": {
          "name": "python"
        },
        "accelerator": "GPU"
      },
      "cells": [
        this.titleCell(crownName, modelId),
        this.setupCell(),
        this.installDependenciesCell(),
        this.downloadCrownDataCell(crownName),
        this.loadModelCell(modelId),
        this.prepareDatasetCell(),
        this.configurePeftCell(options),
        this.trainCell(options),
        this.saveModelCell(modelId, crownName),
        this.testInferenceCell(),
        this.exportToOllamaCell(modelId, crownName)
      ]
    };

    return notebook;
  }

  titleCell(crownName, modelId) {
    return {
      "cell_type": "markdown",
      "metadata": {},
      "source": [
        `# 👑 Fine-Tune ${modelId} with Crown: ${crownName}\n\n`,
        `**Multi-Hive AI Crown System**\n\n`,
        `This notebook fine-tunes the model using knowledge from your Crown.\n\n`,
        `Steps:\n`,
        `1. Install dependencies\n`,
        `2. Download Crown data\n`,
        `3. Load base model\n`,
        `4. Prepare training dataset\n`,
        `5. Fine-tune with PEFT/LoRA\n`,
        `6. Save model\n`,
        `7. Test inference\n`,
        `8. Export to Ollama format\n`
      ]
    };
  }

  setupCell() {
    return {
      "cell_type": "code",
      "metadata": {},
      "source": [
        "# Setup\n",
        "import os\n",
        "import torch\n",
        "import json\n",
        "from datetime import datetime\n\n",
        "# Check GPU\n",
        "print(f\"GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'None'}\")\n",
        "print(f\"CUDA: {torch.cuda.is_available()}\")\n"
      ],
      "execution_count": null,
      "outputs": []
    };
  }

  installDependenciesCell() {
    return {
      "cell_type": "code",
      "metadata": {},
      "source": [
        "# Install dependencies\n",
        "!pip install -q transformers accelerate peft bitsandbytes datasets trl\n",
        "!pip install -q -U huggingface_hub\n\n",
        "print(\"✓ Dependencies installed\")\n"
      ],
      "execution_count": null,
      "outputs": []
    };
  }

  downloadCrownDataCell(crownName) {
    return {
      "cell_type": "code",
      "metadata": {},
      "source": [
        "# Download Crown data from Multi-Hive server\n",
        "import requests\n\n",
        `CROWN_NAME = "${crownName}"\n`,
        "SERVER_URL = input(\"Enter Multi-Hive server URL (e.g., http://your-server:3000): \")\n\n",
        "# Download Crown\n",
        "response = requests.get(f\"{SERVER_URL}/crown/context?name={CROWN_NAME}\")\n",
        "crown_data = response.json()\n\n",
        "# Save Crown context\n",
        "with open('crown_context.txt', 'w') as f:\n",
        "    f.write(crown_data['context'])\n\n",
        "print(f\"✓ Downloaded Crown: {CROWN_NAME}\")\n",
        "print(f\"Context length: {len(crown_data['context'])} characters\")\n"
      ],
      "execution_count": null,
      "outputs": []
    };
  }

  loadModelCell(modelId) {
    return {
      "cell_type": "code",
      "metadata": {},
      "source": [
        "# Load base model\n",
        "from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig\n\n",
        `MODEL_ID = "${modelId}"\n\n`,
        "# 4-bit quantization for efficient training\n",
        "bnb_config = BitsAndBytesConfig(\n",
        "    load_in_4bit=True,\n",
        "    bnb_4bit_quant_type=\"nf4\",\n",
        "    bnb_4bit_compute_dtype=torch.float16,\n",
        "    bnb_4bit_use_double_quant=True\n",
        ")\n\n",
        "# Load model\n",
        "model = AutoModelForCausalLM.from_pretrained(\n",
        "    MODEL_ID,\n",
        "    quantization_config=bnb_config,\n",
        "    device_map=\"auto\",\n",
        "    trust_remote_code=True\n",
        ")\n\n",
        "tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)\n",
        "tokenizer.pad_token = tokenizer.eos_token\n\n",
        "print(f\"✓ Model loaded: {MODEL_ID}\")\n"
      ],
      "execution_count": null,
      "outputs": []
    };
  }

  prepareDatasetCell() {
    return {
      "cell_type": "code",
      "metadata": {},
      "source": [
        "# Prepare training dataset from Crown\n",
        "from datasets import Dataset\n\n",
        "# Load Crown context\n",
        "with open('crown_context.txt', 'r') as f:\n",
        "    crown_context = f.read()\n\n",
        "# Split into training examples\n",
        "# Crown context becomes system prompt for all examples\n",
        "training_examples = [\n",
        "    {\n",
        "        \"text\": f\"<s>[INST] <<SYS>>\\\\n{crown_context}\\\\n<</SYS>>\\\\n\\\\n{prompt} [/INST] {response} </s>\"\n",
        "    }\n",
        "    for prompt, response in [\n",
        "        (\"Explain the main concepts\", \"Based on the knowledge...\"),\n",
        "        (\"Provide an example\", \"Here's an example...\"),\n",
        "        # Add more examples from Crown fine-tuning data\n",
        "    ]\n",
        "]\n\n",
        "# Create dataset\n",
        "dataset = Dataset.from_dict({\"text\": [ex[\"text\"] for ex in training_examples]})\n\n",
        "print(f\"✓ Dataset prepared: {len(dataset)} examples\")\n"
      ],
      "execution_count": null,
      "outputs": []
    };
  }

  configurePeftCell(options) {
    return {
      "cell_type": "code",
      "metadata": {},
      "source": [
        "# Configure PEFT/LoRA for efficient fine-tuning\n",
        "from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training\n\n",
        "# Prepare model for training\n",
        "model = prepare_model_for_kbit_training(model)\n\n",
        "# LoRA config\n",
        "lora_config = LoraConfig(\n",
        `    r=${options.loraR || 16},\n`,
        `    lora_alpha=${options.loraAlpha || 32},\n`,
        "    target_modules=[\"q_proj\", \"v_proj\"],\n",
        `    lora_dropout=${options.loraDropout || 0.05},\n`,
        "    bias=\"none\",\n",
        "    task_type=\"CAUSAL_LM\"\n",
        ")\n\n",
        "model = get_peft_model(model, lora_config)\n",
        "model.print_trainable_parameters()\n\n",
        "print(\"✓ PEFT configured\")\n"
      ],
      "execution_count": null,
      "outputs": []
    };
  }

  trainCell(options) {
    return {
      "cell_type": "code",
      "metadata": {},
      "source": [
        "# Fine-tune model\n",
        "from transformers import TrainingArguments, Trainer\n\n",
        "# Training arguments\n",
        "training_args = TrainingArguments(\n",
        "    output_dir=\"./crown-finetuned\",\n",
        `    num_train_epochs=${options.epochs || 3},\n`,
        `    per_device_train_batch_size=${options.batchSize || 4},\n`,
        "    gradient_accumulation_steps=4,\n",
        `    learning_rate=${options.learningRate || '2e-4'},\n`,
        "    fp16=True,\n",
        "    logging_steps=10,\n",
        "    save_strategy=\"epoch\",\n",
        "    warmup_steps=100,\n",
        "    optim=\"paged_adamw_8bit\"\n",
        ")\n\n",
        "# Trainer\n",
        "trainer = Trainer(\n",
        "    model=model,\n",
        "    args=training_args,\n",
        "    train_dataset=dataset\n",
        ")\n\n",
        "# Start training\n",
        "print(\"🚀 Starting fine-tuning...\")\n",
        "trainer.train()\n\n",
        "print(\"✓ Fine-tuning complete!\")\n"
      ],
      "execution_count": null,
      "outputs": []
    };
  }

  saveModelCell(modelId, crownName) {
    return {
      "cell_type": "code",
      "metadata": {},
      "source": [
        "# Save fine-tuned model\n",
        `MODEL_NAME = "${modelId.replace('/', '-')}-${crownName}"\n\n`,
        "# Save model\n",
        "model.save_pretrained(f\"./crown-finetuned/{MODEL_NAME}\")\n",
        "tokenizer.save_pretrained(f\"./crown-finetuned/{MODEL_NAME}\")\n\n",
        "# Zip for download\n",
        "!zip -r crown-finetuned-model.zip ./crown-finetuned/{MODEL_NAME}\n\n",
        "print(f\"✓ Model saved: {MODEL_NAME}\")\n",
        "print(\"Download crown-finetuned-model.zip to use locally\")\n"
      ],
      "execution_count": null,
      "outputs": []
    };
  }

  testInferenceCell() {
    return {
      "cell_type": "code",
      "metadata": {},
      "source": [
        "# Test fine-tuned model\n",
        "from transformers import pipeline\n\n",
        "# Create text generation pipeline\n",
        "generator = pipeline(\n",
        "    \"text-generation\",\n",
        "    model=model,\n",
        "    tokenizer=tokenizer\n",
        ")\n\n",
        "# Test prompt\n",
        "test_prompt = \"Explain the key concepts from the Crown knowledge\"\n\n",
        "result = generator(\n",
        "    test_prompt,\n",
        "    max_length=200,\n",
        "    num_return_sequences=1\n",
        ")\n\n",
        "print(\"Test generation:\")\n",
        "print(result[0]['generated_text'])\n"
      ],
      "execution_count": null,
      "outputs": []
    };
  }

  exportToOllamaCell(modelId, crownName) {
    return {
      "cell_type": "code",
      "metadata": {},
      "source": [
        "# Export to Ollama format (optional)\n",
        `NEW_MODEL_NAME = \"${modelId.split('/')[1]}-${crownName}\"\n\n`,
        "# Generate Ollama Modelfile\n",
        "modelfile = f'''FROM {MODEL_ID}\n\n",
        "# Crown-finetuned adapter\n",
        "ADAPTER ./crown-finetuned/{MODEL_NAME}\n\n",
        "# System prompt from Crown\n",
        "SYSTEM \"\"\"You are an expert trained on the {CROWN_NAME} Crown knowledge.\"\"\"\n\n",
        "PARAMETER temperature 0.7\n",
        "'''\n\n",
        "with open('Modelfile', 'w') as f:\n",
        "    f.write(modelfile)\n\n",
        "print(\"Ollama Modelfile generated!\")\n",
        "print(\"To use with Ollama:\")\n",
        "print(f\"1. Download crown-finetuned-model.zip\")\n",
        "print(f\"2. Extract files\")\n",
        "print(f\"3. Run: ollama create {NEW_MODEL_NAME} -f Modelfile\")\n"
      ],
      "execution_count": null,
      "outputs": []
    };
  }

  /**
   * Save notebook to file
   */
  async saveNotebook(notebook, outputPath) {
    await fs.writeFile(
      outputPath,
      JSON.stringify(notebook, null, 2)
    );

    console.log(`[Colab] Notebook saved: ${outputPath}`);
  }

  /**
   * Generate Colab URL
   */
  generateColabUrl(notebookPath) {
    // For GitHub-hosted notebooks
    const githubUrl = notebookPath.startsWith('http')
      ? notebookPath
      : `https://github.com/your-org/your-repo/blob/main/${notebookPath}`;

    return `https://colab.research.google.com/github/${githubUrl.replace('https://github.com/', '')}`;
  }
}
