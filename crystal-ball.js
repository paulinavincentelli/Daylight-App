function renderCrystalBall() {
  const mount = document.querySelector("#crystal-ball");
  if (!mount) return;

  if (!window.THREE) {
    console.error("Three.js did not load; showing the CSS crystal ball fallback.");
    return;
  }

  try {
    const THREE = window.THREE;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 20);
    camera.position.set(0, 0, 4.2);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.outputEncoding = THREE.sRGBEncoding;
    mount.appendChild(renderer.domElement);

    const resize = () => {
      const { width, height } = mount.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setPixelRatio(Math.max(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const crystal = new THREE.Group();
    scene.add(crystal);

    scene.add(new THREE.HemisphereLight(0xffefff, 0x403752, 0.7));

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
    keyLight.position.set(-2, 3, 4);
    scene.add(keyLight);

    const violetLight = new THREE.PointLight(0xa982ff, 0.9, 8);
    violetLight.position.set(1, 0.4, 2);
    scene.add(violetLight);

    const aquaLight = new THREE.PointLight(0x87e2d4, 0.5, 8);
    aquaLight.position.set(-1.5, -0.5, 1);
    scene.add(aquaLight);

    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 64, 48),
      new THREE.MeshPhysicalMaterial({
        color: 0x7562b2,
        metalness: 0.08,
        roughness: 0.1,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      })
    );
    glass.position.y = 0.08;
    crystal.add(glass);

    const innerGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.39, 32, 24),
      new THREE.MeshStandardMaterial({
        color: 0xa890e3,
        emissive: 0x281545,
        emissiveIntensity: 0.2,
        roughness: 0.38,
        transparent: true,
        opacity: 0.38,
      })
    );
    innerGlow.position.set(-0.02, 0.08, 0.02);
    crystal.add(innerGlow);

    const sparklePositions = [];
    for (let index = 0; index < 36; index += 1) {
      const latitude = Math.acos(-1 + (2 * index) / 36);
      const longitude = Math.sqrt(36 * Math.PI) * latitude;
      const radius = 0.48;
      sparklePositions.push(
        radius * Math.cos(longitude) * Math.sin(latitude),
        0.08 + radius * Math.cos(latitude),
        radius * Math.sin(longitude) * Math.sin(latitude)
      );
    }

    const sparklesGeometry = new THREE.BufferGeometry();
    sparklesGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(sparklePositions, 3)
    );
    const sparkles = new THREE.Points(
      sparklesGeometry,
      new THREE.PointsMaterial({
        color: 0xfff0cc,
        size: 2,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.86,
      })
    );
    crystal.add(sparkles);

    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(0.76, 0.012, 8, 72),
      new THREE.MeshStandardMaterial({
        color: 0xe9d5ff,
        metalness: 0.55,
        roughness: 0.24,
        transparent: true,
        opacity: 0.7,
      })
    );
    orbit.position.y = 0.08;
    orbit.rotation.set(1.05, 0.2, 0.42);
    crystal.add(orbit);

    const gold = new THREE.MeshStandardMaterial({
      color: 0xc9a879,
      metalness: 0.72,
      roughness: 0.23,
    });
    const setting = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.42, 0.12, 32),
      gold
    );
    setting.position.y = -0.54;
    crystal.add(setting);

    const foot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.45, 0.12, 32),
      gold
    );
    foot.position.y = -0.66;
    crystal.add(foot);

    resize();
    window.addEventListener("resize", resize);
    new ResizeObserver(resize).observe(mount);
    mount.classList.add("is-rendered");

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const animate = (time = 0) => {
      if (!reducedMotion) {
        crystal.rotation.y = time * 0.00022;
        crystal.rotation.x = Math.sin(time * 0.0003) * 0.035;
      }
      renderer.render(scene, camera);
      if (!reducedMotion) window.requestAnimationFrame(animate);
    };

    window.requestAnimationFrame(animate);
  } catch (error) {
    console.error("Could not render the 3D crystal ball.", error);
  }
}

renderCrystalBall();
