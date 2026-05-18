import fs from 'fs-extra';
import type { NavigationTree, FlatNavItem, ArchitectureMap } from '../types/navigation.js';
import { STORAGE_PATHS } from '../config/constants.js';
import { logger } from '../utils/logger.js';

export class NavigationExporter {
  async exportTree(tree: NavigationTree): Promise<string> {
    const filepath = `${STORAGE_PATHS.navigation}/navigation-tree.json`;
    await fs.ensureDir(STORAGE_PATHS.navigation);
    await fs.writeJson(filepath, tree, { spaces: 2 });
    logger.info(`Navigation tree exported: ${filepath}`);
    return filepath;
  }

  async exportFlat(flat: FlatNavItem[]): Promise<string> {
    const filepath = `${STORAGE_PATHS.navigation}/navigation-flat.json`;
    await fs.ensureDir(STORAGE_PATHS.navigation);
    await fs.writeJson(filepath, flat, { spaces: 2 });
    return filepath;
  }

  async exportArchitectureMap(map: ArchitectureMap): Promise<string> {
    const filepath = `${STORAGE_PATHS.navigation}/architecture-map.json`;
    await fs.ensureDir(STORAGE_PATHS.navigation);
    await fs.writeJson(filepath, map, { spaces: 2 });
    logger.info(`Architecture map exported: ${filepath}`);
    return filepath;
  }
}
