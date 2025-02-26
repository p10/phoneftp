import { Client } from 'basic-ftp';
import { argv, fs, path, os } from 'zx';
import readline from 'readline';

const FTP_OPTS = {
  host: process.env.PHONE_HOST,
  port: 2221,
  user: process.env.PHONE_USER,
  password: process.env.PHONE_PASS,
  secure: false,
};

const DOWNLOADS_PATH = path.join(os.homedir(), 'Downloads');
const client = await getClient();

main(client)
  .then(() => client.close())
  .catch((err) => {
    console.error(err.message);
    console.log('');
    client.close();
    help();
  });

function help() {
  console.log(`commands:
   - list - list remote 
   - download <remote> [local] - download file, default local is ~/Downloads
   - downloadDir <remote> [local] - download directory, default local is ~/Downloads
   - upload <local> [remote] - upload file
  `);
  process.exit(1);
}

/**
 * @param {Client} client
 */
async function main(client) {
  const [command, ...args] = argv._;

  if (!command) {
    throw new Error('missing command');
  }

  if (command === 'help' || argv.h || argv.help) {
    return help();
  }

  switch (command) {
    case 'list':
      await list(client);
      break;

    case 'download':
      if (args.length < 1) {
        throw new Error('missing path to a file');
      }
      await download(client, args[0], args[1]);
      break;

    case 'upload':
      if (args.length < 1) {
        throw new Error('missing path to a file');
      }
      await upload(client, args[0], args[1]);
      break;

    case 'downloadDir':
      if (args.length < 1) {
        throw new Error('missing path to a directory');
      }
      await downloadDir(client, args[0], args[1]);
      break;

    default:
      throw new Error('unknown command');
  }
}

const ICONS = [
  '\ueb32', // quesction mark
  '\uf15b', // file
  '\uf4d4', // directory
];

/**
 * @param {number} i
 */
function mapIcon(i) {
  return ICONS[i] || ICONS[0];
}

/**
 * @typedef {{name: string; type: number; size: number; rawModifiedAt: string}} ListItem
 */

/**
 * @arg {Client} client
 */
async function list(client) {
  /** @type {ListItem[]} */
  const list = await client.list();
  for (const item of list) {
    const { unit, value } = convertBytes(item.size);
    console.log(`${mapIcon(item.type)} ${item.name} - ${value} ${unit}`);
  }
}

/**
 * @arg {Client} client
 * @arg {string} remote
 * @arg {string} local
 */
async function download(client, remote, local = DOWNLOADS_PATH) {
  const stat = await fs.lstat(local);
  if (!stat.isDirectory()) {
    throw new Error('Local path must be a directory');
  }

  const p = path.parse(remote);
  if (!p.base) {
    throw new Error('Only files can be downloaded');
  }

  try {
    client.trackProgress(progress());
    await client.downloadTo(path.join(local, p.base), remote);
    client.trackProgress();
  } catch (err) {
    console.error(err);
  }
}

/**
 * @arg {Client} client
 * @arg {string} remote
 * @arg {string} [local=DOWNLOADS_PATH]
 */
async function downloadDir(client, remote, local = DOWNLOADS_PATH) {
  const localStat = await fs.lstat(local);
  if (!localStat.isDirectory()) {
    throw new Error('Local path must be a directory');
  }

  if (remote[0] !== '/') {
    remote = '/' + remote;
  }

  if (remote[remote.length - 1] !== '/') {
    remote += '/';
  }

  local = path.join(local, remote);
  fs.mkdirp(local);

  try {
    client.trackProgress(progress());
    await client.downloadToDir(local, remote);
    client.trackProgress();
  } catch (err) {
    console.error(err);
  }
}

/**
 * @arg {Client} client
 * @arg {string} remote
 * @arg {string} local
 */
async function upload(client, local, remote = '/') {
  const stat = await fs.lstat(local);
  if (stat.isDirectory()) {
    throw new Error('Local path must be a file');
  }

  const p = path.parse(local);

  try {
    client.trackProgress(progress());
    await client.uploadFrom(local, path.join(remote, p.base));
    client.trackProgress();
  } catch (err) {
    console.error(err);
  }
}

async function getClient() {
  try {
    const client = new Client();
    await client.access(FTP_OPTS);
    return client;
  } catch (err) {
    console.error('Failed to connect to FTP server');
    process.exit(1);
  }
}

function progress() {
  let i = 0;
  /**
   * @arg {{name: string; type: string; bytes: number; bytesOverall: number}} info
   */
  return (info) => {
    if (i > 0) {
      readline.moveCursor(process.stdout, 0, -1);
      readline.clearScreenDown(process.stdout);
    }
    const { value, unit } = convertBytes(info.bytesOverall);
    console.log(`${info.name} - ${value} ${unit}`);
    i++;
  };
}

/**
 * @param {number} bytes
 */
function convertBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex++;
  }

  return { value: value.toFixed(2), unit: units[unitIndex] };
}
