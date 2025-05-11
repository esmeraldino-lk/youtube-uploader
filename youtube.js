const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv))
    .option('video', {
        alias: 'v',
        description: 'Path to video file',
        type: 'string',
        demandOption: true
    })
    .option('meta', {
        alias: 'm',
        description: 'Path to metadata JSON file',
        type: 'string',
        demandOption: true
    })
    .help()
    .argv;

async function uploadVideo(videoPath, metadataPath) {
    try {
        // Verificar se os arquivos existem
        if (!fs.existsSync(videoPath)) {
            throw new Error(`Video file not found: ${videoPath}`);
        }
        if (!fs.existsSync(metadataPath)) {
            throw new Error(`Metadata file not found: ${metadataPath}`);
        }

        // Ler metadata
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

        // Iniciar browser
        const browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null
        });

        const page = await browser.newPage();
        
        // Carregar cookies se existirem
        const cookiesPath = path.join(__dirname, 'cookies.json');
        if (fs.existsSync(cookiesPath)) {
            const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
            await page.setCookie(...cookies);
        }

        // Ir para página de upload do YouTube
        await page.goto('https://studio.youtube.com/channel/UC/videos/upload?d=ud', {
            waitUntil: 'networkidle0'
        });

        // Se não estiver logado, aguardar login manual
        if (page.url().includes('accounts.google.com')) {
            console.log('Por favor, faça login na sua conta do Google...');
            await page.waitForNavigation({ waitUntil: 'networkidle0' });
            
            // Salvar cookies após login
            const currentCookies = await page.cookies();
            fs.writeFileSync(cookiesPath, JSON.stringify(currentCookies));
        }

        // Aguardar elemento de upload
        await page.waitForSelector('input[type="file"]');
        
        // Upload do vídeo
        const [fileChooser] = await Promise.all([
            page.waitForFileChooser(),
            page.click('#upload-button')
        ]);
        await fileChooser.accept([videoPath]);

        // Aguardar carregamento do formulário
        await page.waitForSelector('#textbox');

        // Preencher título
        await page.click('#textbox');
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        await page.keyboard.type(metadata.title);

        // Preencher descrição
        await page.click('#description-textarea');
        await page.keyboard.type(metadata.description);

        // Marcar como "Não é conteúdo para crianças" se necessário
        if (!metadata.madeForKids) {
            await page.click('#toggle-button[name="NOT_MADE_FOR_KIDS"]');
        }

        // Adicionar tags
        if (metadata.tags && metadata.tags.length > 0) {
            await page.click('#tags-container');
            await page.keyboard.type(metadata.tags.join(','));
        }

        // Marcar como Short se necessário
        if (metadata.isShort) {
            await page.click('#shorts-toggle');
        }

        // Definir visibilidade
        await page.click('#next-button');
        await page.click('#next-button');
        await page.click('#next-button');
        
        if (metadata.privacyStatus === 'public') {
            await page.click('#privacy-radios paper-radio-button[name="PUBLIC"]');
        }

        // Publicar
        await page.click('#done-button');

        // Aguardar conclusão do upload
        await page.waitForSelector('.ytcp-video-thumbnail-with-progress');
        
        // Extrair URL do vídeo
        const videoUrl = await page.$eval('.ytcp-video-info a', el => el.href);
        console.log('Upload concluído! URL:', videoUrl);

        // Fechar browser
        await browser.close();

        return videoUrl;

    } catch (error) {
        console.error('Erro no upload:', error);
        throw error;
    }
}

// Executar upload
uploadVideo(argv.video, argv.meta)
    .then(url => {
        console.log('Success:', url);
        process.exit(0);
    })
    .catch(error => {
        console.error('Error:', error);
        process.exit(1);
    });