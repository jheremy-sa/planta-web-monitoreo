import cv2

for i in range(3):
    cam = cv2.VideoCapture(i)
    ok, frame = cam.read()
    if ok:
        print(f"Índice {i}: cámara detectada, resolución {frame.shape[1]}x{frame.shape[0]}")
        cv2.imshow(f"Camara indice {i}", frame)
        cv2.waitKey(2000)
        cv2.destroyAllWindows()
    else:
        print(f"Índice {i}: no hay cámara aquí")
    cam.release()