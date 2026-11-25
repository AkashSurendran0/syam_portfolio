/**
 * SyamKrishna S - Portfolio Interactive Script
 * Replicating Framer interactions, smooth navigation, filters & lightbox
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Sticky Header on Scroll
  const header = document.querySelector('.site-header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });

  // 2. Mobile Drawer Navigation
  const mobileToggle = document.querySelector('.mobile-toggle');
  const mobileDrawer = document.querySelector('.mobile-drawer');
  const mobileLinks = document.querySelectorAll('.mobile-drawer .nav-link');

  if (mobileToggle && mobileDrawer) {
    mobileToggle.addEventListener('click', () => {
      mobileToggle.classList.toggle('active');
      mobileDrawer.classList.toggle('open');
    });

    mobileLinks.forEach(link => {
      link.addEventListener('click', () => {
        mobileToggle.classList.remove('active');
        mobileDrawer.classList.remove('open');
      });
    });
  }

  // 3. Scroll Spy / Active Nav Indicator
  const sections = document.querySelectorAll('section[id], footer[id]');
  const navLinks = document.querySelectorAll('.nav-menu .nav-link');

  window.addEventListener('scroll', () => {
    let currentId = '';
    const scrollPosition = window.scrollY + 200;

    sections.forEach(section => {
      const top = section.offsetTop;
      const height = section.offsetHeight;
      if (scrollPosition >= top && scrollPosition < top + height) {
        currentId = section.getAttribute('id');
      }
    });

    navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === `#${currentId}`) {
        link.classList.add('active');
      }
    });
  });

  // 4. Project Filtering & Dynamic Loading
  const filterBtns = document.querySelectorAll('.filter-btn');
  let currentActiveFilter = 'all';

  function applyProjectFilter(filterValue) {
    currentActiveFilter = filterValue;
    const cards = document.querySelectorAll('.project-card');
    cards.forEach(card => {
      const category = card.getAttribute('data-category') || '';
      if (filterValue === 'all' || category.includes(filterValue)) {
        card.style.display = 'flex';
        setTimeout(() => {
          card.style.opacity = '1';
          card.style.transform = 'translateY(0)';
        }, 50);
      } else {
        card.style.opacity = '0';
        card.style.transform = 'translateY(15px)';
        setTimeout(() => {
          card.style.display = 'none';
        }, 200);
      }
    });
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyProjectFilter(btn.getAttribute('data-filter'));
    });
  });

  // 5. Interactive Lightbox Modal with Sub-Image Angle Toggling
  const lightboxModal = document.querySelector('.lightbox-modal');
  const lightboxImg = document.querySelector('.lightbox-img');
  const lightboxProjectTitle = document.querySelector('.lightbox-project-title');
  const lightboxAngleIndicator = document.querySelector('.lightbox-angle-indicator');
  const lightboxAngleSwitcher = document.querySelector('.lightbox-angle-switcher');
  const lightboxCloseBtn = document.querySelector('.lightbox-close-btn');
  const lightboxAnglePrevBtn = document.querySelector('.lightbox-angle-prev');
  const lightboxAngleNextBtn = document.querySelector('.lightbox-angle-next');
  const lightboxProjPrevBtn = document.querySelector('.lightbox-proj-prev');
  const lightboxProjNextBtn = document.querySelector('.lightbox-proj-next');

  let activeProjects = [];
  let currentProjectIndex = 0;
  let currentAngleIndex = 0;

  function collectVisibleProjects() {
    activeProjects = [];
    const cards = document.querySelectorAll('.project-card');
    cards.forEach(card => {
      if (card.style.display !== 'none') {
        const title = card.getAttribute('data-project-title') || card.querySelector('.project-title')?.textContent || 'Project';
        let angles = [];
        try {
          const rawAngles = card.getAttribute('data-angles');
          if (rawAngles) {
            angles = JSON.parse(rawAngles);
          }
        } catch (err) {
          console.error('Error parsing angles for project:', title, err);
        }

        if (!angles || angles.length === 0) {
          const img = card.querySelector('.project-thumb img');
          if (img) {
            angles = [{ src: img.getAttribute('src'), label: '01 View' }];
          }
        }

        activeProjects.push({
          title,
          angles,
          cardElement: card
        });
      }
    });
  }

  function renderModalState(projectIdx, angleIdx, animate = true) {
    if (activeProjects.length === 0) return;
    if (projectIdx < 0) projectIdx = activeProjects.length - 1;
    if (projectIdx >= activeProjects.length) projectIdx = 0;
    currentProjectIndex = projectIdx;

    const currentProject = activeProjects[currentProjectIndex];
    if (angleIdx < 0) angleIdx = currentProject.angles.length - 1;
    if (angleIdx >= currentProject.angles.length) angleIdx = 0;
    currentAngleIndex = angleIdx;

    const currentAngle = currentProject.angles[currentAngleIndex];

    // 1. Update Title & Counter
    if (lightboxProjectTitle) {
      lightboxProjectTitle.textContent = currentProject.title;
    }
    if (lightboxAngleIndicator) {
      if (currentProject.angles.length > 1) {
        lightboxAngleIndicator.textContent = `Angle ${currentAngleIndex + 1} of ${currentProject.angles.length}`;
        lightboxAngleIndicator.style.display = 'inline-block';
      } else {
        lightboxAngleIndicator.textContent = '1 Angle';
        lightboxAngleIndicator.style.display = 'inline-block';
      }
    }

    // 2. Update Image with subtle fade transition
    if (lightboxImg && currentAngle) {
      if (animate) {
        lightboxImg.classList.add('fade-out');
        setTimeout(() => {
          lightboxImg.src = currentAngle.src;
          lightboxImg.onload = () => {
            lightboxImg.classList.remove('fade-out');
          };
          setTimeout(() => lightboxImg.classList.remove('fade-out'), 120);
        }, 120);
      } else {
        lightboxImg.src = currentAngle.src;
        lightboxImg.classList.remove('fade-out');
      }
    }

    // 3. Render Angle Switcher Pills
    if (lightboxAngleSwitcher) {
      lightboxAngleSwitcher.innerHTML = '';
      if (currentProject.angles.length > 1) {
        currentProject.angles.forEach((angle, idx) => {
          const pill = document.createElement('button');
          pill.className = `angle-toggle-btn ${idx === currentAngleIndex ? 'active' : ''}`;
          pill.innerHTML = `<span style="opacity: 0.65; font-family: monospace;">[${idx + 1 < 10 ? '0' + (idx + 1) : idx + 1}]</span> ${angle.label.replace(/^0\d\s*—?\s*/, '') || 'Angle ' + (idx + 1)}`;
          pill.addEventListener('click', (e) => {
            e.stopPropagation();
            if (idx !== currentAngleIndex) {
              renderModalState(currentProjectIndex, idx, true);
            }
          });
          lightboxAngleSwitcher.appendChild(pill);
        });
      }
    }

    // 4. Update Nav arrows state (disable if only 1 angle)
    if (lightboxAnglePrevBtn && lightboxAngleNextBtn) {
      if (currentProject.angles.length <= 1) {
        lightboxAnglePrevBtn.style.opacity = '0.2';
        lightboxAnglePrevBtn.style.pointerEvents = 'none';
        lightboxAngleNextBtn.style.opacity = '0.2';
        lightboxAngleNextBtn.style.pointerEvents = 'none';
      } else {
        lightboxAnglePrevBtn.style.opacity = '1';
        lightboxAnglePrevBtn.style.pointerEvents = 'auto';
        lightboxAngleNextBtn.style.opacity = '1';
        lightboxAngleNextBtn.style.pointerEvents = 'auto';
      }
    }
  }

  // Bind project card click handlers
  function bindProjectCards() {
    const cards = document.querySelectorAll('.project-card');
    cards.forEach(card => {
      // Remove any existing listener by clone or ensure single attachment
      card.onclick = () => {
        collectVisibleProjects();
        const cardTitle = card.getAttribute('data-project-title') || card.querySelector('.project-title')?.textContent;
        const foundIdx = activeProjects.findIndex(p => p.title === cardTitle);
        renderModalState(foundIdx >= 0 ? foundIdx : 0, 0, false);
        if (lightboxModal) {
          lightboxModal.classList.add('active');
          document.body.style.overflow = 'hidden';
        }
      };
    });
  }

  // Load Dynamic Projects from /api/projects
  async function loadDynamicPortfolioProjects() {
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !Array.isArray(data.projects)) return;

      const grid = document.querySelector('.projects-grid');
      if (!grid) return;

      // Always clear grid when API responds successfully
      grid.innerHTML = '';

      if (data.projects.length === 0) {
        grid.innerHTML = `
          <div style="grid-column: 1 / -1; padding: 60px 20px; text-align: center; color: var(--color-text-muted);">
            <p style="font-size: 1.1rem; margin-bottom: 0;">No projects published yet.</p>
          </div>
        `;
        return;
      }

      data.projects.forEach(project => {
        const firstAngle = (project.angles && project.angles.length > 0) ? project.angles[0].src : '';
        const count = project.angles ? project.angles.length : 1;
        const anglesStr = JSON.stringify(project.angles).replace(/"/g, '&quot;');

        const card = document.createElement('div');
        card.className = 'project-card';
        card.setAttribute('data-category', project.category || 'residential');
        card.setAttribute('data-project-title', project.title);
        card.setAttribute('data-angles', JSON.stringify(project.angles));

        card.innerHTML = `
            <div class="project-thumb">
                <img src="${firstAngle}" alt="${project.title}" loading="lazy" decoding="async">
                <span class="project-angles-tag">${count} ${count === 1 ? 'Angle' : 'Angles'}</span>
            </div>
            <div class="project-body">
                <div class="project-header-row">
                    <h3 class="project-title">${project.title}</h3>
                    <div class="project-arrow-btn">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                    </div>
                </div>
            </div>
        `;
        grid.appendChild(card);
      });

      bindProjectCards();
      applyProjectFilter(currentActiveFilter);
    } catch (err) {
      console.log('Error loading dynamic projects:', err.message);
    }
  }

  // Load Dynamic Categories from /api/categories (Zero-DB Stored in data/categories.js)
  async function loadDynamicCategories() {
    try {
      const res = await fetch('/api/categories');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !Array.isArray(data.categories) || data.categories.length === 0) return;

      const filterBar = document.querySelector('.projects-filter-bar');
      if (!filterBar) return;

      filterBar.innerHTML = '';

      // All Projects button
      const allBtn = document.createElement('button');
      allBtn.className = `filter-btn ${currentActiveFilter === 'all' ? 'active' : ''}`;
      allBtn.setAttribute('data-filter', 'all');
      allBtn.textContent = 'All Projects';
      allBtn.addEventListener('click', () => {
        document.querySelectorAll('.projects-filter-bar .filter-btn').forEach(b => b.classList.remove('active'));
        allBtn.classList.add('active');
        applyProjectFilter('all');
      });
      filterBar.appendChild(allBtn);

      // Category buttons from categories.js
      data.categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `filter-btn ${currentActiveFilter === cat.id ? 'active' : ''}`;
        btn.setAttribute('data-filter', cat.id);
        btn.textContent = cat.label;
        btn.addEventListener('click', () => {
          document.querySelectorAll('.projects-filter-bar .filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          applyProjectFilter(cat.id);
        });
        filterBar.appendChild(btn);
      });
    } catch (err) {
      console.log('Using static filter buttons fallback:', err.message);
    }
  }

  // Initial Card Binding & Dynamic Fetch
  bindProjectCards();
  loadDynamicCategories();
  loadDynamicPortfolioProjects();

  // Toggle angle Prev / Next
  if (lightboxAnglePrevBtn) {
    lightboxAnglePrevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      renderModalState(currentProjectIndex, currentAngleIndex - 1, true);
    });
  }

  if (lightboxAngleNextBtn) {
    lightboxAngleNextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      renderModalState(currentProjectIndex, currentAngleIndex + 1, true);
    });
  }

  // Jump Project Prev / Next
  if (lightboxProjPrevBtn) {
    lightboxProjPrevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      renderModalState(currentProjectIndex - 1, 0, true);
    });
  }

  if (lightboxProjNextBtn) {
    lightboxProjNextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      renderModalState(currentProjectIndex + 1, 0, true);
    });
  }

  // Close modal
  function closeLightboxModal() {
    if (lightboxModal) {
      lightboxModal.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  if (lightboxCloseBtn) {
    lightboxCloseBtn.addEventListener('click', closeLightboxModal);
  }

  if (lightboxModal) {
    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal) {
        closeLightboxModal();
      }
    });
  }

  // Keyboard navigation
  // Left/Right: Toggle between angles of this project
  // Shift + Left/Right: Jump to Prev/Next project
  // 1, 2, 3, 4: Quick-jump to angle 1, 2, 3, 4
  document.addEventListener('keydown', (e) => {
    if (!lightboxModal || !lightboxModal.classList.contains('active')) return;

    if (e.key === 'Escape') {
      closeLightboxModal();
    } else if (e.key === 'ArrowLeft') {
      if (e.shiftKey) {
        renderModalState(currentProjectIndex - 1, 0, true);
      } else {
        renderModalState(currentProjectIndex, currentAngleIndex - 1, true);
      }
    } else if (e.key === 'ArrowRight') {
      if (e.shiftKey) {
        renderModalState(currentProjectIndex + 1, 0, true);
      } else {
        renderModalState(currentProjectIndex, currentAngleIndex + 1, true);
      }
    } else if (['1', '2', '3', '4', '5'].includes(e.key)) {
      const targetAngle = parseInt(e.key, 10) - 1;
      const proj = activeProjects[currentProjectIndex];
      if (proj && targetAngle < proj.angles.length) {
        renderModalState(currentProjectIndex, targetAngle, true);
      }
    }
  });

  // Touch Swipe for mobile devices
  let touchStartX = 0;
  let touchEndX = 0;
  const stageEl = document.querySelector('.lightbox-stage');
  if (stageEl) {
    stageEl.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    stageEl.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      if (touchStartX - touchEndX > 50) {
        // Swiped Left -> Next Angle
        renderModalState(currentProjectIndex, currentAngleIndex + 1, true);
      } else if (touchEndX - touchStartX > 50) {
        // Swiped Right -> Prev Angle
        renderModalState(currentProjectIndex, currentAngleIndex - 1, true);
      }
    }, { passive: true });
  }

  // 6. FAQ Accordion
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const questionBtn = item.querySelector('.faq-question');
    if (questionBtn) {
      questionBtn.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        faqItems.forEach(i => i.classList.remove('active'));
        if (!isActive) {
          item.classList.add('active');
        }
      });
    }
  });

  // 7. Counter Animation on Scroll
  const counters = document.querySelectorAll('.counter-number');
  let counted = false;

  const counterSection = document.querySelector('#numbers');
  if (counterSection && counters.length > 0) {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !counted) {
        counted = true;
        counters.forEach(counter => {
          const target = parseInt(counter.getAttribute('data-target'), 10);
          const suffix = counter.getAttribute('data-suffix') || '';
          let count = 0;
          const duration = 1800;
          const stepTime = Math.abs(Math.floor(duration / (target || 1)));

          const timer = setInterval(() => {
            count += 1;
            counter.innerHTML = `${count}<span>${suffix}</span>`;
            if (count >= target) {
              counter.innerHTML = `${target}<span>${suffix}</span>`;
              clearInterval(timer);
            }
          }, stepTime);
        });
      }
    }, { threshold: 0.3 });

    observer.observe(counterSection);
  }

  // 8. Interactive Contact Form Handler
  const contactForm = document.querySelector('#contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.querySelector('#formName').value.trim();
      const email = document.querySelector('#formEmail').value.trim();
      const phone = document.querySelector('#formPhone').value.trim();
      const desc = document.querySelector('#formDesc').value.trim();

      const subject = encodeURIComponent(`Design Inquiry from ${name}`);
      const body = encodeURIComponent(
        `Hi SyamKrishna,\n\n` +
        `I would like to discuss a project with you.\n\n` +
        `Client Name: ${name}\n` +
        `Email: ${email}\n` +
        `Phone: ${phone || 'Not provided'}\n\n` +
        `Project Details:\n${desc}\n\n` +
        `Best regards,\n${name}`
      );

      // Open mail client
      window.location.href = `mailto:syamkrishnas2003@gmail.com?subject=${subject}&body=${body}`;

      const feedback = document.querySelector('#formFeedback');
      if (feedback) {
        feedback.style.display = 'block';
        feedback.textContent = 'Opening your email client with the pre-filled inquiry. Thank you!';
        setTimeout(() => {
          feedback.style.display = 'none';
        }, 6000);
      }
    });
  }

  // 9. Back To Top Button
  const backToTopBtn = document.querySelector('.back-to-top');
  if (backToTopBtn) {
    backToTopBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }
});
