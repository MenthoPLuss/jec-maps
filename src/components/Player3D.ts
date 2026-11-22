import * as THREE from "three";

import {
  MercatorCoordinate,
  type CustomLayerInterface,
} from "maplibre-gl";

type Position = [number, number];

export type Player3DLayer =
  CustomLayerInterface & {
    setPosition: (position: Position) => void;
    setHeading: (heading: number) => void;
  };

export function createPlayer3DLayer(
  initialPosition: Position
): Player3DLayer {
  let currentPosition = initialPosition;

  let heading = 0;

  let camera: THREE.Camera;
  let scene: THREE.Scene;
  let renderer: THREE.WebGLRenderer;
  let player: THREE.Group;

  const VISUAL_SCALE = 3;

  const createPlayer = () => {
    const group = new THREE.Group();

    // BODY
    const bodyGeometry =
      new THREE.BoxGeometry(
        0.55,
        0.3,
        0.9
      );

    const bodyMaterial =
      new THREE.MeshStandardMaterial({
        color: 0x2563eb,
      });

    const body = new THREE.Mesh(
      bodyGeometry,
      bodyMaterial
    );

    body.position.z = 1.35;

    group.add(body);

    // HEAD
    const headGeometry =
      new THREE.SphereGeometry(
        0.25,
        24,
        24
      );

    const headMaterial =
      new THREE.MeshStandardMaterial({
        color: 0xf2c6a0,
      });

    const head = new THREE.Mesh(
      headGeometry,
      headMaterial
    );

    head.position.z = 2.05;

    group.add(head);

    // LEFT LEG
    const legGeometry =
      new THREE.BoxGeometry(
        0.18,
        0.2,
        0.85
      );

    const legMaterial =
      new THREE.MeshStandardMaterial({
        color: 0x1f2937,
      });

    const leftLeg = new THREE.Mesh(
      legGeometry,
      legMaterial
    );

    leftLeg.position.set(
      -0.16,
      0,
      0.55
    );

    group.add(leftLeg);

    // RIGHT LEG
    const rightLeg = new THREE.Mesh(
      legGeometry.clone(),
      legMaterial.clone()
    );

    rightLeg.position.set(
      0.16,
      0,
      0.55
    );

    group.add(rightLeg);

    // LEFT ARM
    const armGeometry =
      new THREE.BoxGeometry(
        0.15,
        0.15,
        0.7
      );

    const armMaterial =
      new THREE.MeshStandardMaterial({
        color: 0xf2c6a0,
      });

    const leftArm = new THREE.Mesh(
      armGeometry,
      armMaterial
    );

    leftArm.position.set(
      -0.4,
      0,
      1.4
    );

    leftArm.rotation.y = -0.2;

    group.add(leftArm);

    // RIGHT ARM
    const rightArm = new THREE.Mesh(
      armGeometry.clone(),
      armMaterial.clone()
    );

    rightArm.position.set(
      0.4,
      -0.08,
      1.45
    );

    rightArm.rotation.x = -0.55;

    group.add(rightArm);

    // PHONE / GPS
    const phoneGeometry =
      new THREE.BoxGeometry(
        0.18,
        0.06,
        0.32
      );

    const phoneMaterial =
      new THREE.MeshStandardMaterial({
        color: 0x111827,
      });

    const phone = new THREE.Mesh(
      phoneGeometry,
      phoneMaterial
    );

    phone.position.set(
      0.42,
      -0.33,
      1.35
    );

    phone.rotation.x = -0.6;

    group.add(phone);

    return group;
  };

  const layer: Player3DLayer = {
    id: "jec-player-3d",

    type: "custom",

    renderingMode: "3d",

    onAdd(map, gl) {
      camera = new THREE.Camera();

      scene = new THREE.Scene();

      player = createPlayer();

      scene.add(player);

      // Ambient lighting
      const ambientLight =
        new THREE.AmbientLight(
          0xffffff,
          1.5
        );

      scene.add(ambientLight);

      // Main sunlight
      const directionalLight =
        new THREE.DirectionalLight(
          0xffffff,
          2
        );

      directionalLight.position.set(
        0,
        -70,
        100
      );

      directionalLight
        .position
        .normalize();

      scene.add(directionalLight);

      // Opposite light
      const directionalLight2 =
        new THREE.DirectionalLight(
          0xffffff,
          1
        );

      directionalLight2.position.set(
        0,
        70,
        100
      );

      directionalLight2
        .position
        .normalize();

      scene.add(directionalLight2);

      renderer =
        new THREE.WebGLRenderer({
          canvas: map.getCanvas(),

          context: gl,

          antialias: true,
        });

      renderer.autoClear = false;
    },

    render(_gl, args) {
      const mercator =
        MercatorCoordinate.fromLngLat(
          currentPosition,
          0
        );

      const meterScale =
        mercator
          .meterInMercatorCoordinateUnits();

      const modelScale =
        meterScale * VISUAL_SCALE;

      const rotationX =
        new THREE.Matrix4()
          .makeRotationAxis(
            new THREE.Vector3(
              1,
              0,
              0
            ),

            Math.PI / 2
          );

      const rotationZ =
        new THREE.Matrix4()
          .makeRotationAxis(
            new THREE.Vector3(
              0,
              0,
              1
            ),

            THREE.MathUtils.degToRad(
              -heading
            )
          );

      const mapMatrix =
        new THREE.Matrix4()
          .fromArray(
            args
              .defaultProjectionData
              .mainMatrix
          );

      const modelMatrix =
        new THREE.Matrix4()
          .makeTranslation(
            mercator.x,
            mercator.y,
            mercator.z
          )
          .scale(
            new THREE.Vector3(
              modelScale,
              -modelScale,
              modelScale
            )
          )
          .multiply(rotationX)
          .multiply(rotationZ);

      camera.projectionMatrix =
        mapMatrix.multiply(
          modelMatrix
        );

      renderer.resetState();

      renderer.render(
        scene,
        camera
      );
    },

    setPosition(position) {
      currentPosition = position;
    },

    setHeading(newHeading) {
      heading = newHeading;
    },
  };

  return layer;
}