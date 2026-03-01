# How to Upload to GitHub

Follow these steps to upload your Bharat Tours & Travels project to GitHub.

## Prerequisites

- GitHub account (create at https://github.com if you don't have one)
- Git installed on your computer
- Project files ready

## Step-by-Step Guide

### 1. Create a New Repository on GitHub

1. Log in to GitHub (https://github.com)
2. Click the "+" icon (top right) → "New repository"
3. Repository name: `bharatandaman` (or your preferred name)
4. Description: "Travel booking website with Razorpay payment integration"
5. Choose "Public" (for open source) or "Private" (for personal use)
6. **DO NOT** initialize with README (we already have one)
7. Click "Create repository"

### 2. Copy Your Repository URL

After creating the repository, you'll see a page with your repository URL:
- HTTPS: `https://github.com/yourusername/bharatandaman.git`
- SSH: `git@github.com:yourusername/bharatandaman.git`

Copy the HTTPS URL.

### 3. Initialize Git in Your Project

Open terminal/command prompt in your project folder:

```bash
# Initialize git repository
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: Travel booking website with Razorpay integration"

# Add remote repository
git remote add origin https://github.com/yourusername/bharatandaman.git

# Rename branch to main (if needed)
git branch -M main

# Push to GitHub
git push -u origin main
```

### 4. Verify on GitHub

1. Go to your repository: `https://github.com/yourusername/bharatandaman`
2. You should see all your files
3. README.md will display automatically

## Commands Breakdown

```bash
# Check git status
git status

# See commit history
git log

# View remote
git remote -v

# Update existing repository
git add .
git commit -m "Your message here"
git push
```

## Troubleshooting

### "fatal: not a git repository"
```bash
git init
```

### "Permission denied (publickey)"
Set up SSH keys: https://docs.github.com/en/authentication/connecting-to-github-with-ssh

### "already exists"
Repository already exists. Check your folder structure.

### "nothing to commit"
All files already committed. Make changes and commit again.

## Making Updates

After initial upload, to push new changes:

```bash
git add .
git commit -m "Description of changes"
git push
```

## Share Your Repository

After uploading to GitHub, share the link:
```
https://github.com/yourusername/bharatandaman
```

## Additional Options

### Add GitHub Pages (Host on GitHub for free)

1. Go to repository Settings
2. Scroll to "GitHub Pages"
3. Select "main" branch as source
4. Save

Your site will be available at: `https://yourusername.github.io/bharatandaman/`

### Add Topics

1. Go to repository main page
2. Click gear icon (top right)
3. Add topics: travel, booking, payment, razorpay

### Add Shields/Badges

Add to README.md:
```markdown
![GitHub](https://img.shields.io/github/license/yourusername/bharatandaman)
![Stars](https://img.shields.io/github/stars/yourusername/bharatandaman)
```

## Need Help?

- GitHub Docs: https://docs.github.com
- Git Guide: https://git-scm.com/doc
- GitHub CLI: https://cli.github.com

---

**Your project is now on GitHub! Share it with the world! 🚀**