import { useState, useRef, useEffect } from 'react'
import { websocketService, type WebSocketCallbacks } from './services/websocketService'
import './App.css'

type ProcessingStage = 'idle' | 'uploading' | 'processing' | 'translating' | 'generating' | 'completed' | 'error'

interface MenuItem {
  id: string
  name: string
  originalName: string
  description: string
  price?: string
  category?: string
  imageUrl?: string
  isGenerating?: boolean
}

function App() {
  const [stage, setStage] = useState<ProcessingStage>('idle')
  const [subStepMessage, setSubStepMessage] = useState<string>('')
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isShowingCamera, setIsShowingCamera] = useState(false)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = async (e) => {
        setUploadedImage(e.target?.result as string)
        await processImage(file)
      }
      reader.readAsDataURL(file)
    }
  }

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } // Use back camera on mobile
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        setIsShowingCamera(true)
      }
    } catch (error) {
      console.error('Error accessing camera:', error)
      alert('Camera access denied or not available')
    }
  }

  const capturePhoto = async () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current
      const video = videoRef.current
      const context = canvas.getContext('2d')
      
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      context?.drawImage(video, 0, 0)
      
      const imageData = canvas.toDataURL('image/jpeg')
      setUploadedImage(imageData)
      
      // Stop camera
      const stream = video.srcObject as MediaStream
      stream?.getTracks().forEach(track => track.stop())
      setIsShowingCamera(false)
      
      // Convert canvas to blob and process
      try {
        const blob = await websocketService.canvasToBlob(canvas)
        await processImage(blob)
      } catch (error) {
        console.error('Failed to capture photo:', error)
        setStage('error')
      }
    }
  }

  const processImage = async (imageFile: File | Blob) => {
    if (!websocketService.isSocketConnected()) {
      console.error('WebSocket not connected')
      setStage('error')
      return
    }

    setStage('uploading')
    setMenuItems([]) // Clear previous results
    
    try {
      const result = await websocketService.uploadImage(imageFile, 'English', true)
      if (!result.success) {
        throw new Error(result.error || 'Upload failed')
      }
      console.log('Upload successful:', result)
    } catch (error) {
      console.error('Failed to upload image:', error)
      setStage('error')
    }
  }

  const resetApp = () => {
    setStage('idle')
    setSubStepMessage('')
    setMenuItems([])
    setUploadedImage(null)
    setIsShowingCamera(false)
  }

  // WebSocket callbacks
  const websocketCallbacks: WebSocketCallbacks = {
    onConnectionStatus: (connected) => {
      console.log('WebSocket connection status:', connected)
      if (!connected && stage !== 'idle') {
        setStage('error')
      }
    },
    
    onOCRStarted: () => {
      console.log('OCR started')
      setStage('processing')
      setSubStepMessage('')
    },
    
    onOCRProgress: (data) => {
      console.log('OCR progress:', data)
      setSubStepMessage(data.message)
    },
    
    onOCRComplete: (data) => {
      console.log('OCR completed:', data)
      setSubStepMessage('')
    },
    
    onOCRError: (data) => {
      console.error('OCR error:', data)
      setStage('error')
    },
    
    onTranslationStarted: () => {
      console.log('Translation started')
      setStage('translating')
      setSubStepMessage('')
    },
    
    onTranslationProgress: (data) => {
      console.log('Translation progress:', data)
      setSubStepMessage(data.message)
    },
    
    onTranslationComplete: (data) => {
      console.log('Translation completed:', data)
      setSubStepMessage('')
      // Convert backend MenuItem to frontend MenuItem format
      const convertedItems: MenuItem[] = data.translatedMenu.map((item, index) => ({
        id: `item-${index}`,
        name: item.name,
        originalName: item.originalName,
        description: item.description,
        price: item.price,
        category: item.category,
        imageUrl: item.imageUrl,
        isGenerating: true // Will be set to false when images are generated
      }))
      setMenuItems(convertedItems)
    },
    
    onTranslationError: (data) => {
      console.error('Translation error:', data)
      setStage('error')
    },
    
    onImageGenerationStarted: () => {
      console.log('Image generation started')
      setStage('generating')
      setSubStepMessage('')
    },
    
    onImageGenerationProgress: (data) => {
      console.log('Image generation progress:', data)
      setSubStepMessage(data.message)
    },
    
    onImageGenerated: (data) => {
      console.log('Image generated:', data)
      // Update the specific menu item with the generated image
      setMenuItems(prev => prev.map(item => {
        if (item.name === data.itemName || item.originalName === data.itemName) {
          return {
            ...item,
            imageUrl: data.imageUrl,
            isGenerating: false
          }
        }
        return item
      }))
    },
    
    onImageGenerationError: (data) => {
      console.error('Image generation error:', data)
      // Continue processing other images, don't stop entire flow
    },
    
    onProcessingComplete: (data) => {
      console.log('Processing completed:', data)
      setStage('completed')
      // Ensure all items are marked as not generating
      setMenuItems(prev => prev.map(item => ({ ...item, isGenerating: false })))
    },
    
    onProcessingError: (data) => {
      console.error('Processing error:', data)
      setStage('error')
    }
  }

  // Initialize WebSocket connection
  useEffect(() => {
    websocketService.connect(websocketCallbacks)
    
    return () => {
      websocketService.disconnect()
    }
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>🍽️ Vibe Menu Translator</h1>
        <p>Take a picture or upload a menu to get AI-powered images of the dishes.</p>
      </header>

      {stage === 'idle' && (
        <div className="upload-section">
          <div className="upload-options">
            <label htmlFor="file-input" className="upload-button">
              📁 Upload Photo
            </label>
            <input
              id="file-input"
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              style={{ display: 'none' }}
            />
            
            <button onClick={startCamera} className="camera-button">
              📸 Take Photo
            </button>
          </div>

          {isShowingCamera && (
            <div className="camera-section">
              <video ref={videoRef} autoPlay playsInline className="camera-preview" />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              <div className="camera-controls">
                <button onClick={capturePhoto} className="capture-button">
                  📸 Capture
                </button>
                <button onClick={() => setIsShowingCamera(false)} className="cancel-button">
                  ✕ Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {uploadedImage && stage !== 'idle' && (
        <div className="uploaded-image">
          <img src={uploadedImage} alt="Uploaded menu" className="menu-image" />
        </div>
      )}

      {stage !== 'idle' && (
        <div className="progress-section">
          <div className="progress-indicator">
            {stage === 'uploading' && (
              <div className="progress-step active">
                <div className="spinner"></div>
                <span>📤 Uploading your delicious menu...</span>
              </div>
            )}
            {stage === 'processing' && (
              <div className="progress-step active">
                <div className="spinner"></div>
                <span>{subStepMessage || '🤖 AI is reading and understanding your menu...'}</span>
              </div>
            )}
            {stage === 'translating' && (
              <div className="progress-step active">
                <div className="spinner"></div>
                <span>{subStepMessage || '🌍 Translating and analyzing delicious dishes...'}</span>
              </div>
            )}
            {stage === 'generating' && (
              <div className="progress-step active">
                <div className="spinner"></div>
                <span>{subStepMessage || '✨ Generating mouth-watering dish images...'}</span>
              </div>
            )}
            {stage === 'error' && (
              <div className="progress-step error">
                <span>❌ Something went wrong. Please try again.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {menuItems.length > 0 && (
        <div className="menu-results">
          <h2>🍴 Your Menu Discoveries</h2>
          <div className="menu-grid">
            {menuItems.map((item) => (
              <div key={item.id} className={`menu-card ${item.isGenerating ? 'generating' : ''}`}>
                {item.imageUrl && !item.isGenerating ? (
                  <img src={item.imageUrl} alt={item.name} className="dish-image" />
                ) : (
                  <div className="image-placeholder">
                    <div className="image-spinner"></div>
                    <span>Generating image...</span>
                  </div>
                )}
                <div className="card-content">
                  <h3 className={item.isGenerating ? 'generating-text' : ''}>
                    {item.name}
                  </h3>
                  {item.originalName && item.originalName !== item.name && (
                    <p className="original-name">({item.originalName})</p>
                  )}
                  <p className={item.isGenerating ? 'generating-text' : ''}>
                    {item.description}
                  </p>
                  {item.price && (
                    <p className="price">{item.price}</p>
                  )}
                  {item.isGenerating && (
                    <div className="generating-indicator">
                      <div className="dots">
                        <span></span><span></span><span></span>
                      </div>
                      <small>Creating your perfect dish...</small>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {stage === 'generating' && (
            <div className="more-coming">
              <div className="pulse-dot"></div>
              <span>Images are being crafted...</span>
            </div>
          )}
        </div>
      )}

      {(stage === 'completed' || stage === 'error') && (
        <div className="completion-actions">
          <button onClick={resetApp} className="reset-button">
            🔄 {stage === 'error' ? 'Try Again' : 'Process Another Menu'}
          </button>
        </div>
      )}
    </div>
  )
}

export default App
