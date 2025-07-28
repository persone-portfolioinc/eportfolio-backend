
const express = require('express');
const multer = require('multer');
const { Octokit } = require('@octokit/rest');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const sanitizeHtml = require('sanitize-html');

const app = express();
const port = process.env.PORT || 3000;

// GitHub token and username
const githubToken = process.env.GITHUB_TOKEN;
const githubUser = process.env.GITHUB_USER;

if (!githubToken || !githubUser) {
  console.error('GITHUB_TOKEN and GITHUB_USER must be set in environment variables');
  process.exit(1);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: './uploads',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${file.fieldname}${ext}`);
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'cv' && file.mimetype !== 'application/pdf') {
      return cb(new Error('CV must be a PDF file'));
    }
    if (file.fieldname === 'image' && !file.mimetype.match(/^image\/(jpeg|png)$/)) {
      return cb(new Error('Profile image must be a JPEG or PNG file'));
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});
app.use('/api/generate', limiter);

// Base template structure
const baseTemplate = (colors) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="{name} - Professional Portfolio | Expertise in {profession}" />
  <meta name="keywords" content="{keywords}, portfolio, {profession}" />
  <title>{name} | {profession} Portfolio</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Poppins:wght@500;700&display=swap" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/aos@2.3.1/dist/aos.css" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; background: ${colors.bodyBg}; color: ${colors.text}; line-height: 1.8; overflow-x: hidden; }
    nav { background: ${colors.navBg}; position: sticky; top: 0; z-index: 1000; padding: 1.5rem 2rem; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2); }
    .nav-container { max-width: 1400px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; }
    .nav-logo { font-family: 'Poppins', sans-serif; font-size: 2.2rem; color: ${colors.accent}; letter-spacing: 1.5px; }
    .nav-links { display: flex; gap: 3rem; }
    .nav-links a { color: ${colors.navText}; text-decoration: none; font-size: 1.1rem; font-weight: 600; transition: color 0.3s, transform 0.3s; }
    .nav-links a:hover, .nav-links a.active { color: ${colors.accent}; transform: translateY(-3px); }
    .hamburger { display: none; font-size: 2rem; color: ${colors.navText}; cursor: pointer; }
    .hero { background: ${colors.heroBg}; height: 80vh; display: flex; align-items: center; justify-content: center; text-align: center; position: relative; overflow: hidden; }
    .hero::before { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: ${colors.heroOverlay}; z-index: 1; }
    .hero-content { position: relative; z-index: 2; max-width: 1100px; padding: 2rem; }
    .hero h1 { font-family: 'Poppins', sans-serif; font-size: 4rem; color: ${colors.heroText}; margin-bottom: 1.5rem; text-shadow: 0 3px 6px rgba(0, 0, 0, 0.4); }
    .hero p { font-size: 1.5rem; color: ${colors.accent}; margin-bottom: 3rem; }
    .cta-button { display: inline-block; padding: 1.2rem 3.5rem; background: ${colors.buttonBg}; color: ${colors.buttonText}; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 1.2rem; transition: background 0.3s, transform 0.3s, box-shadow 0.3s; }
    .cta-button:hover { background: ${colors.buttonHover}; transform: scale(1.05); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3); }
    .container { max-width: 1400px; margin: 5rem auto; padding: 0 2rem; }
    .section { background: ${colors.sectionBg}; border-radius: 20px; padding: 4rem; margin-bottom: 5rem; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15); width: 100%; max-width: 1200px; transition: transform 0.4s; }
    .section:hover { transform: translateY(-8px); }
    h2 { font-family: 'Poppins', sans-serif; font-size: 2.8rem; color: ${colors.text}; margin-bottom: 2.5rem; position: relative; }
    h2::after { content: ''; position: absolute; bottom: -0.8rem; left: 0; width: 100px; height: 5px; background: ${colors.accentGradient}; }
    .headshot { width: 300px; height: 300px; border-radius: 50%; border: 5px solid ${colors.accent}; box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25); object-fit: cover; object-position: center; margin: 0 auto 2.5rem; display: block; }
    .headshot:hover { transform: scale(1.05); box-shadow: 0 15px 35px rgba(0, 0, 0, 0.3); }
    .skills-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 2.5rem; }
    .skill-item { background: ${colors.skillBg}; padding: 1.8rem; border-radius: 15px; text-align: center; font-weight: 600; transition: background 0.3s, transform 0.3s, box-shadow 0.3s; }
    .skill-item:hover { background: ${colors.accentGradient}; color: ${colors.skillHoverText}; transform: translateY(-10px); box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2); }
    .progress-bar { height: 10px; background: ${colors.progressBg}; border-radius: 5px; margin-top: 1.2rem; overflow: hidden; }
    .progress { height: 100%; background: ${colors.accentGradient}; transition: width 1.5s ease-in-out; }
    .project { background: ${colors.projectBg}; padding: 3rem; border-radius: 20px; margin-bottom: 3rem; transition: transform 0.4s, box-shadow 0.4s; }
    .project:hover { transform: translateY(-8px); box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2); }
    .project h3 { font-family: 'Poppins', sans-serif; font-size: 2rem; margin-bottom: 1.2rem; color: ${colors.text}; }
    .project p { margin-bottom: 1.8rem; color: ${colors.secondaryText}; font-size: 1.1rem; }
    .project a { display: inline-block; color: ${colors.accent}; text-decoration: none; font-weight: 600; padding: 0.8rem 2rem; border-radius: 10px; transition: background 0.3s, transform 0.3s; }
    .project a:hover { background: ${colors.accentHover}; transform: scale(1.05); }
    .project-badge { background: ${colors.accent}; color: ${colors.buttonText}; padding: 0.6rem 1.2rem; border-radius: 25px; font-size: 1rem; font-weight: 600; }
    .resume-content, .contact-content { text-align: center; }
    .resume-button, .contact-links a { display: inline-block; padding: 1.2rem 3.5rem; background: ${colors.buttonBg}; color: ${colors.buttonText}; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 1.2rem; transition: background 0.3s, transform 0.3s, box-shadow 0.3s; }
    .resume-button:hover, .contact-links a:hover { background: ${colors.buttonHover}; transform: scale(1.05); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3); }
    .contact-links { display: flex; justify-content: center; gap: 2rem; flex-wrap: wrap; }
    .contact-links a { padding: 1rem 2.5rem; display: flex; align-items: center; gap: 0.5rem; }
    footer { background: ${colors.footerBg}; color: ${colors.navText}; text-align: center; padding: 3.5rem; }
    footer p { font-size: 1.2rem; }
    footer a { color: ${colors.accent}; text-decoration: none; transition: color 0.3s; }
    footer a:hover { color: ${colors.accentHoverSolid}; }
    @media (max-width: 1024px) { .hero h1 { font-size: 3rem; } .hero p { font-size: 1.3rem; } }
    @media (max-width: 768px) { .nav-links { display: none; flex-direction: column; position: absolute; top: 80px; left: 0; width: 100%; background: ${colors.navBg}; padding: 2rem; } .nav-links.active { display: flex; } .hamburger { display: block; } .hero h1 { font-size: 2.5rem; } .hero p { font-size: 1.1rem; } .container { margin: 3rem 1.5rem; padding: 1rem; } .headshot { width: 200px; height: 200px; } .section { padding: 2.5rem; } .skills-grid { grid-template-columns: 1fr; } .contact-links { flex-direction: column; gap: 1.5rem; } }
    @media (max-width: 480px) { .nav-logo { font-size: 1.8rem; } .hero h1 { font-size: 2rem; } .hero p { font-size: 0.9rem; } .cta-button { padding: 0.8rem 2rem; font-size: 1rem; } .section { padding: 2rem; } }
  </style>
</head>
<body>
  <nav>
    <div class="nav-container">
      <div class="nav-logo">{name} | {profession}</div>
      <div class="nav-links" id="nav-links">
        <a href="#home" class="active">Home</a>
        <a href="#about">About</a>
        <a href="#skills">Skills</a>
        <a href="#projects">Projects</a>
        <a href="#resume">Resume</a>
        <a href="#contact">Contact</a>
      </div>
      <div class="hamburger" id="hamburger">☰</div>
    </div>
  </nav>
  <section class="hero" id="home">
    <div class="hero-content" data-aos="zoom-in">
      <h1>{name} | {profession}</h1>
      <p>{tagline}</p>
      <a href="#contact" class="cta-button">Connect with Me</a>
    </div>
  </section>
  <div class="container">
    <section class="section about" id="about" data-aos="slide-right">
      <img class="headshot" src="./headshot.jpg" alt="Profile Image" loading="lazy">
      <h2>Professional Summary</h2>
      <p>{summary}</p>
      <h3 style="font-size: 1.8rem; margin: 2rem 0 1rem;">About Me</h3>
      <p>{about}</p>
    </section>
    <section class="section skills" id="skills" data-aos="slide-left">
      <h2>Areas of Expertise</h2>
      <div class="skills-grid">
        {skills}
      </div>
    </section>
    <section class="section projects" id="projects" data-aos="fade-up">
      <h2>Featured Projects</h2>
      {projects}
      <p style="text-align: center; font-style: italic; color: ${colors.secondaryText};">Additional projects available upon request.</p>
    </section>
    <section class="section resume" id="resume" data-aos="zoom-in">
      <h2>Download My Resume</h2>
      <div class="resume-content">
        <p>Explore my detailed professional background and achievements in my resume.</p>
        <a href="./resume.pdf" download class="resume-button">Download Resume</a>
      </div>
    </section>
    <section class="section contact" id="contact" data-aos="zoom-in">
      <h2>Contact Me</h2>
      <div class="contact-content">
        <p>Reach out to discuss opportunities or explore my work further.</p>
        <div class="contact-links">
          <a href="mailto:{email}" aria-label="Email">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${colors.buttonText}" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
            Email Me
          </a>
          <a href="{linkedin}" target="_blank" aria-label="LinkedIn Profile">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${colors.buttonText}" stroke-width="2"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
            LinkedIn
          </a>
          <a href="./resume.pdf" download aria-label="Download Resume">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${colors.buttonText}" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
            Download Resume
          </a>
        </div>
      </div>
    </section>
  </div>
  <footer>
    <p>Contact: <a href="mailto:{email}" aria-label="Email">{email}</a> | {phone}</p>
    <p>© 2025 {name} | {profession} Portfolio</p>
  </footer>
  <script src="https://cdn.jsdelivr.net/npm/aos@2.3.1/dist/aos.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/vanilla-tilt@1.7.0/dist/vanilla-tilt.min.js"></script>
  <script>
    AOS.init({ duration: 1200, easing: 'ease-out-quart', once: true });
    VanillaTilt.init(document.querySelectorAll('.project'), { max: 8, speed: 400, glare: true, 'max-glare': 0.3 });
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('nav-links');
    hamburger.addEventListener('click', () => {
      navLinks.classList.toggle('active');
      hamburger.textContent = navLinks.classList.contains('active') ? '✕' : '☰';
    });
    const links = document.querySelectorAll('.nav-links a');
    links.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('href').substring(1);
        document.getElementById(targetId).scrollIntoView({ behavior: 'smooth' });
        links.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        if (window.innerWidth <= 768) {
          navLinks.classList.remove('active');
          hamburger.textContent = '☰';
        }
      });
    });
    window.addEventListener('scroll', () => {
      const sections = document.querySelectorAll('.section, .hero');
      let current = '';
      sections.forEach(section => {
        const sectionTop = section.offsetTop;
        if (window.scrollY >= sectionTop - 80) {
          current = section.getAttribute('id');
        }
      });
      links.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href').substring(1) === current) {
          link.classList.add('active');
        }
      });
    });
  </script>
</body>
</html>`;

// Template color schemes
const templates = {
  default: baseTemplate({
    bodyBg: 'linear-gradient(135deg, #f9fafb 0%, #e5e7eb 100%)',
    text: '#1f2937',
    navBg: 'linear-gradient(90deg, #1e3a8a 0%, #3b82f6 100%)',
    navText: '#f9fafb',
    accent: '#f59e0b',
    accentGradient: 'linear-gradient(90deg, #f59e0b, #d97706)',
    accentHover: 'rgba(245, 158, 11, 0.3)',
    accentHoverSolid: '#d97706',
    heroBg: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
    heroOverlay: 'rgba(30, 58, 138, 0.7)',
    heroText: '#f9fafb',
    buttonBg: 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)',
    buttonHover: 'linear-gradient(90deg, #d97706 0%, #b45309 100%)',
    buttonText: '#1f2937',
    sectionBg: 'rgba(255, 255, 255, 0.98)',
    skillBg: 'linear-gradient(135deg, #e5e7eb 0%, #f9fafb 100%)',
    skillHoverText: '#1f2937',
    progressBg: '#e5e7eb',
    projectBg: '#f9fafb',
    secondaryText: '#6b7280',
    footerBg: '#1e3a8a',
  }),
  dark: baseTemplate({
    bodyBg: 'linear-gradient(135deg, #111827 0%, #1f2937 100%)',
    text: '#e5e7eb',
    navBg: 'linear-gradient(90deg, #111827 0%, #1f2937 100%)',
    navText: '#e5e7eb',
    accent: '#0ea5e9',
    accentGradient: 'linear-gradient(90deg, #0ea5e9, #0284c7)',
    accentHover: 'rgba(14, 165, 233, 0.3)',
    accentHoverSolid: '#0284c7',
    heroBg: 'linear-gradient(135deg, #111827 0%, #1f2937 100%)',
    heroOverlay: 'rgba(17, 24, 39, 0.7)',
    heroText: '#e5e7eb',
    buttonBg: 'linear-gradient(90deg, #0ea5e9 0%, #0284c7 100%)',
    buttonHover: 'linear-gradient(90deg, #0284c7 0%, #0369a1 100%)',
    buttonText: '#111827',
    sectionBg: 'rgba(31, 41, 55, 0.98)',
    skillBg: 'linear-gradient(135deg, #1f2937 0%, #374151 100%)',
    skillHoverText: '#111827',
    progressBg: '#374151',
    projectBg: '#1f2937',
    secondaryText: '#9ca3af',
    footerBg: '#111827',
  }),
  vibrant: baseTemplate({
    bodyBg: '#f9fafb', // Soft light gray – clean canvas
    text: '#111827', // Deep slate – sharp, readable
    navBg: '#1e3a8a', // Navy blue – confident, trust-building
    navText: '#ffffff', // Crisp white – contrast against navy
    accent: '#0ea5e9', // Sky blue – fresh, modern highlight
    accentGradient: 'linear-gradient(90deg, #0ea5e9, #2563eb)', // Sky to royal blue
    accentHover: 'rgba(14, 165, 233, 0.1)', // Soft hover
    accentHoverSolid: '#2563eb', // Royal blue – slightly bolder
    heroBg: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)', // Strong and sleek
    heroOverlay: 'rgba(30, 58, 138, 0.6)', // Adds depth
    heroText: '#ffffff',
    buttonBg: 'linear-gradient(90deg, #0ea5e9 0%, #2563eb 100%)', // Vibrant CTA
    buttonHover: 'linear-gradient(90deg, #2563eb 0%, #1e3a8a 100%)',
    buttonText: '#ffffff',
    sectionBg: '#ffffff', // Clean sections
    skillBg: '#f1f5f9', // Light slate – minimal contrast
    skillHoverText: '#0ea5e9', // Consistent with accent
    progressBg: '#e5e7eb', // Subtle progress track
    projectBg: '#f9fafb', // Consistent with body
    secondaryText: '#6b7280', // Cool gray – for labels
    footerBg: '#1e3a8a', // Matches nav – anchors the design
}),
};

// API endpoint to generate ePortfolio
app.post('/api/generate', upload.fields([{ name: 'cv' }, { name: 'image' }]), async (req, res) => {
  try {
    const {
      name,
      profession,
      tagline,
      summary,
      about,
      email,
      linkedin,
      phone,
      skills,
      skillProficiencies,
      projects,
      template: selectedTemplate,
    } = req.body;
    const cvFile = req.files['cv'] ? req.files['cv'][0] : null;
    const imageFile = req.files['image'] ? req.files['image'][0] : null;

    // Validate required fields
    if (!name || !profession || !email) {
      return res.status(400).json({ error: 'Name, profession, and email are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate template
    if (!templates[selectedTemplate]) {
      return res.status(400).json({ error: 'Invalid template selected' });
    }

    // Parse and sanitize JSON fields
    const parsedSkills = JSON.parse(skills || '[]').map(skill => sanitizeHtml(skill));
    const parsedProficiencies = JSON.parse(skillProficiencies || '[]');
    const parsedProjects = JSON.parse(projects || '[]').map(project => ({
      ...project,
      title: sanitizeHtml(project.title),
      description: sanitizeHtml(project.description),
      link: project.link ? sanitizeHtml(project.link) : '',
      category: sanitizeHtml(project.category),
    }));

    // Validate skills and proficiencies
    if (parsedSkills.length !== parsedProficiencies.length) {
      return res.status(400).json({ error: 'Number of skills and proficiencies must match' });
    }

    // Generate skills HTML
    const skillsHtml = parsedSkills
      .map(
        (skill, index) => `
        <div class="skill-item" data-aos="fade-up" data-aos-delay="${100 + index * 100}">
          ${skill || 'Skill ' + (index + 1)}
          <div class="progress-bar">
            <div class="progress" style="width: ${parsedProficiencies[index] || 0}%"></div>
          </div>
        </div>`
      )
      .join('');

    // Generate projects HTML (only include link if provided)
    const projectsHtml = parsedProjects
      .filter(project => project.title && project.description) // Only include projects with title and description
      .map(
        (project, index) => `
        <article class="project" data-tilt data-tilt-max="8" data-aos="fade-up" data-aos-delay="${100 + index * 100}">
          <div>
            <h3>${project.title || 'Project ' + (index + 1)}</h3>
            <p>${project.description || 'No description provided'}</p>
            ${project.link ? `<a href="${project.link}" target="_blank">View Project</a>` : ''}
            <span class="project-badge">${project.category || 'General'}</span>
          </div>
        </article>`
      )
      .join('');

    // Sanitize all inputs
    const sanitizedData = {
      name: sanitizeHtml(name),
      profession: sanitizeHtml(profession),
      tagline: sanitizeHtml(tagline),
      summary: sanitizeHtml(summary),
      about: sanitizeHtml(about),
      email: sanitizeHtml(email),
      linkedin: linkedin ? sanitizeHtml(linkedin) : 'https://linkedin.com',
      phone: sanitizeHtml(phone),
      keywords: parsedSkills.join(', '),
    };

    // Select template
    let generatedHtml = templates[selectedTemplate]
      .replace(/{name}/g, sanitizedData.name || 'Your Name')
      .replace(/{profession}/g, sanitizedData.profession || 'Your Profession')
      .replace(/{tagline}/g, sanitizedData.tagline || 'Your Tagline or Mission Statement')
      .replace(/{summary}/g, sanitizedData.summary || 'Describe your professional background, expertise, and key achievements.')
      .replace(/{about}/g, sanitizedData.about || 'Share your personal story, passions, and what drives you in your career.')
      .replace(/{email}/g, sanitizedData.email || 'your.email@example.com')
      .replace(/{linkedin}/g, sanitizedData.linkedin || 'https://linkedin.com')
      .replace(/{phone}/g, sanitizedData.phone || 'Your Phone Number')
      .replace(/{keywords}/g, sanitizedData.keywords || 'your-keywords')
      .replace(/{skills}/g, skillsHtml)
      .replace(/{projects}/g, projectsHtml);

    // Initialize Octokit
    const octokit = new Octokit({ auth: githubToken });

    // Create a new GitHub repository under the user's account
    const repoName = `eportfolio-${sanitizedData.name.toLowerCase().replace(/\s/g, '-')}-${Date.now()}`;
    const repoResponse = await octokit.repos.createForAuthenticatedUser({
      name: repoName,
      auto_init: true,
      homepage: `https://${githubUser}.github.io/${repoName}`,
    });

    // Enable GitHub Pages
    try {
      await octokit.repos.createPagesSite({
        owner: githubUser,
        repo: repoName,
        source: { branch: 'main', path: '/' },
      });
    } catch (error) {
      console.error('Error enabling GitHub Pages:', error);
      throw new Error('Failed to enable GitHub Pages');
    }

    // Save files to temporary directory
    const repoPath = path.join(__dirname, 'temp', repoName);
    await fs.mkdir(repoPath, { recursive: true });

    // Write HTML
    await fs.writeFile(path.join(repoPath, 'index.html'), generatedHtml);

    // Prepare files to commit
    const filesToCommit = [
      { path: 'index.html', content: Buffer.from(generatedHtml).toString('base64') },
    ];
    if (cvFile) {
      await fs.copyFile(cvFile.path, path.join(repoPath, 'resume.pdf'));
      filesToCommit.push({ path: 'resume.pdf', content: await fs.readFile(cvFile.path, 'base64') });
    }
    if (imageFile) {
      await fs.copyFile(imageFile.path, path.join(repoPath, 'headshot.jpg'));
      filesToCommit.push({ path: 'headshot.jpg', content: await fs.readFile(imageFile.path, 'base64') });
    }

    // Commit files to GitHub
    for (const file of filesToCommit) {
      try {
        await octokit.repos.createOrUpdateFileContents({
          owner: githubUser,
          repo: repoName,
          path: file.path,
          message: `Add ${file.path}`,
          content: file.content,
          branch: 'main',
        });
      } catch (error) {
        console.error(`Error committing ${file.path}:`, error);
        throw new Error(`Failed to commit ${file.path}`);
      }
    }

    // Clean up temporary files
    await fs.rm(repoPath, { recursive: true, force: true });
    if (cvFile) await fs.unlink(cvFile.path).catch(() => {});
    if (imageFile) await fs.unlink(imageFile.path).catch(() => {});

    // Return the GitHub Pages URL
    res.json({ url: `https://${githubUser}.github.io/${repoName}` });
  } catch (error) {
    console.error('Error generating ePortfolio:', error);
    res.status(500).json({ error: error.message || 'Failed to generate ePortfolio' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
