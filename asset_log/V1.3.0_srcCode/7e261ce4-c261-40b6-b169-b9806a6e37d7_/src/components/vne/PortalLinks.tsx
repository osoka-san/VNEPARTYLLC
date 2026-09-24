import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { designConfig } from "@/config/design-config";
import { createPortalPose, getPortalScrollPoseInto, type PortalPose } from "@/config/motion-config";
import { createPortalGeometry, portalLinks, type PortalLinkSpec } from "@/lib/portal-geometry";

function applyPose(node: THREE.Group, pose: PortalPose) {
  node.position.set(...pose.position);
  node.rotation.set(...pose.rotation);
}

function PortalLink({
  index,
  spec,
  displayedProgressRef,
  paused,
  mobile,
  hiddenDrop,
}: {
  index: number;
  spec: PortalLinkSpec;
  displayedProgressRef: React.RefObject<number>;
  paused: boolean;
  mobile: boolean;
  hiddenDrop: number;
}) {
  const group = useRef<THREE.Group>(null);
  const geometry = useMemo(() => createPortalGeometry(spec), [spec]);
  const pose = useRef(createPortalPose());
  const hiddenPose = useRef(createPortalPose());
  getPortalScrollPoseInto(
    index,
    displayedProgressRef.current ?? 0,
    mobile,
    hiddenDrop,
    pose.current,
    hiddenPose.current,
  );

  useFrame(() => {
    const node = group.current;
    if (!node || paused) return;
    getPortalScrollPoseInto(
      index,
      displayedProgressRef.current ?? 0,
      mobile,
      hiddenDrop,
      pose.current,
      hiddenPose.current,
    );
    applyPose(node, pose.current);
  });

  return (
    <group
      ref={group}
      name={spec.id}
      position={pose.current.position}
      rotation={pose.current.rotation}
    >
      <mesh geometry={geometry} castShadow>
        <meshPhysicalMaterial
          color={spec.color}
          roughness={designConfig.material.roughness}
          metalness={designConfig.material.metalness}
          clearcoat={designConfig.material.clearcoat}
          clearcoatRoughness={designConfig.material.clearcoatRoughness}
          side={THREE.FrontSide}
        />
      </mesh>
    </group>
  );
}

export function PortalLinks({
  displayedProgressRef,
  paused,
  mobile,
  hiddenDrop,
}: {
  displayedProgressRef: React.RefObject<number>;
  paused: boolean;
  mobile: boolean;
  hiddenDrop: number;
}) {
  return (
    <group position={[0, -0.25, 0]}>
      {portalLinks.map((link, index) => {
        return (
          <PortalLink
            key={link.id}
            index={index}
            spec={link}
            displayedProgressRef={displayedProgressRef}
            paused={paused}
            mobile={mobile}
            hiddenDrop={hiddenDrop}
          />
        );
      })}
    </group>
  );
}
