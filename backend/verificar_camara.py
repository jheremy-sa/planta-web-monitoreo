import cv2

for i in range(4):
    cam = cv2.VideoCapture(i)
    ok, frame = cam.read()
    if ok:
        print(f"Indice {i}: camara detectada, resolucion {frame.shape[1]}x{frame.shape[0]}")
    else:
        print(f"Indice {i}: no hay camara aqui")
    cam.release()
